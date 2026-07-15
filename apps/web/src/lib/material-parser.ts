import type { ContentPack, TranscriptLine } from "@langtube/core";
import path from "path";
import { readContentPack, saveContentPack } from "@/lib/data";
import { applyTranscriptLines } from "@/lib/apply-transcript";
import {
  fetchSubtitlesFromUrlDetailed,
  fetchBilibiliZhTranslations,
  mergeZhTranslationsIntoLines,
  transcriptMatchesSourceLang,
} from "@/lib/subtitle-fetcher";
import {
  extractTextSubtitlesFromLocal,
  transcribeAudioSubtitles,
} from "@/lib/subtitle-extractor";
import {
  enrichContentPack,
  needsLlmEnrichment,
} from "@/lib/llm/enrich-pack";
import { isPackContentReady } from "@/lib/pack-readiness";
import {
  completeAgentTask,
  failAgentTask,
  updateAgentTaskStatus,
  createParseListeningTask,
  readAgentTask,
} from "@/lib/agent-task-service";
import { pushLearningData } from "@/lib/github-sync";
import { syncMaterialMedia } from "@/lib/media-sync";
import {
  getRelativeMediaPath,
  getMediaFilename,
} from "@/lib/storage-resolver";
import { applyLevelFilterAndNotebook } from "@/lib/level-reference/sync-notebook";
import { finalizeManifestForListen } from "@/lib/pack-finalize";
import {
  checkParseDependencies,
  formatMissingDependencyHints,
} from "@/lib/parse-deps";
import { getLlmConfig } from "@/lib/llm/client";
import {
  ensureMaterialMediaDownload,
  packHasPlayableLocal,
} from "@/lib/ensure-media";
import {
  sourceLangFromMaterial,
  defaultLevelForLang,
} from "@/lib/material-form";
import type { SupportedLanguage } from "@langtube/core";
import type { EnrichReferenceOptions } from "@/lib/llm/enrich-from-reference";
import {
  needsSegmentMinutesConfirm,
  resolveParseWindow,
  transcriptDurationSec,
} from "@/lib/parse-token-policy";
import {
  filterTranscriptForLearning,
  sliceTranscriptByRange,
} from "@/lib/transcript-noise-filter";
import { isBasicSkipWord } from "@/lib/vocab-extract";

export type ParseMaterialOptions = {
  force?: boolean;
  /** 跳过 LLM，仅用规则 + 词典（更稳妥，适合配额用尽时） */
  offlineOnly?: boolean;
  /** 解析期间跳过 GitHub 推送，避免限流与文件竞争 */
  skipSync?: boolean;
  referenceOptions?: EnrichReferenceOptions;
  /** 用户确认：可自动抽取/转写字幕（否则优先等人手传 SRT） */
  allowAutoSubtitles?: boolean;
  /** 长素材分段时长（分钟） */
  segmentMinutes?: number;
  /** 只解析该时间窗（秒） */
  rangeStartSec?: number;
  rangeEndSec?: number;
};

export type ParseStage =
  | "acquiring"
  | "enriching"
  | "syncing"
  | "done"
  | "failed";

export interface MaterialParseResult {
  parseStatus: ContentPack["manifest"]["parseStatus"];
  lines: number;
  source?: string;
  message: string;
  stage: ParseStage;
  llmEnriched?: boolean;
}

const STALE_PROCESSING_MS = 5 * 60 * 1000;
const activeParses = new Set<string>();
const parseQueue: { id: string; options?: ParseMaterialOptions }[] = [];
let drainingParseQueue = false;

async function drainParseQueue(): Promise<void> {
  if (drainingParseQueue) return;
  drainingParseQueue = true;
  while (parseQueue.length > 0) {
    const job = parseQueue.shift()!;
    try {
      await parseMaterial(job.id, job.options);
    } catch (err) {
      console.error(`Background parse failed for ${job.id}:`, err);
    }
  }
  drainingParseQueue = false;
}

function isFullyParsed(pack: ContentPack): boolean {
  if (pack.manifest.parseStatus !== "ready" || !isPackContentReady(pack)) {
    return false;
  }
  // 省 Token：规则模式不要求行级对照译文；字幕跟随只展示原声
  return true;
}

function isStaleProcessing(pack: ContentPack): boolean {
  if (pack.manifest.parseStatus !== "processing") return false;
  const updated = new Date(pack.manifest.updatedAt).getTime();
  if (Number.isNaN(updated)) return true;
  return Date.now() - updated > STALE_PROCESSING_MS;
}

async function pushSyncSafe(
  reason: string,
  skipSync?: boolean
): Promise<void> {
  if (skipSync) {
    console.info(`[parse] sync skipped (${reason}): offline/stable mode`);
    return;
  }
  try {
    const result = await pushLearningData();
    if (result.pushed === 0 && result.message.includes("未配置")) {
      console.warn(`[parse] sync skipped (${reason}):`, result.message);
    } else {
      console.info(`[parse] sync (${reason}):`, result.message);
    }
  } catch (err) {
    console.error(`[parse] sync failed (${reason}):`, err);
  }
}

/**
 * 获取字幕：已上传/内嵌/外挂优先 → URL → Whisper 语音转写
 */
async function acquireSubtitles(
  pack: ContentPack
): Promise<{ lines: TranscriptLine[]; source: string; message: string }> {
  const messages: string[] = [];
  const url = pack.manifest.sourceUrl ?? pack.storage.url;
  const lang = pack.manifest.sourceLang;

  if (url && !packHasPlayableLocal(pack)) {
    const media = await ensureMaterialMediaDownload(pack.manifest.id, url);
    if (media.ok && media.path) {
      pack.storage.path = media.path;
      pack.storage.url = url;
      pack.manifest.sourceUrl = url;
      pack.manifest.storage = pack.storage;
      messages.push(media.message || "视频已下载到本地");
    } else if (media.error) {
      messages.push(media.error);
    }
  }

  if (pack.storage.path) {
    const textSubs = await extractTextSubtitlesFromLocal(pack.storage.path);
    if (textSubs.lines.length) {
      if (
        url &&
        pack.manifest.nativeLang === "zh" &&
        !textSubs.lines.some((l) => l.translation?.trim())
      ) {
        const zhBody = await fetchBilibiliZhTranslations(url);
        mergeZhTranslationsIntoLines(textSubs.lines, zhBody);
      }
      return {
        lines: textSubs.lines,
        source: textSubs.source,
        message: [messages.join("；"), textSubs.message].filter(Boolean).join("；"),
      };
    }
    messages.push(textSubs.message);
  }

  if (url) {
    const result = await fetchSubtitlesFromUrlDetailed(
      url,
      lang,
      pack.manifest.nativeLang ?? "zh"
    );
    if (result.lines.length) {
      return {
        lines: result.lines,
        source: "url",
        message: [messages.join("；"), result.message].filter(Boolean).join("；"),
      };
    }
    messages.push(result.message || "URL 字幕获取失败");
  }

  if (pack.storage.path) {
    const audio = await transcribeAudioSubtitles(pack.storage.path, lang);
    if (audio.lines.length) {
      return {
        lines: audio.lines,
        source: audio.source,
        message: [messages.join("；"), audio.message].filter(Boolean).join("；"),
      };
    }
    messages.push(audio.message);
  }

  return {
    lines: [],
    source: "none",
    message: messages.join("；") || "未关联视频文件或链接",
  };
}

export async function parseMaterial(
  materialId: string,
  options?: ParseMaterialOptions
): Promise<MaterialParseResult> {
  const pack = await readContentPack(materialId);
  if (!pack) {
    return {
      parseStatus: "error",
      lines: 0,
      message: "素材不存在",
      stage: "failed",
    };
  }

  // 从 id 前缀纠正语言（如 es-coco-xxx 应为 es 而非 ja）
  const inferredLang = sourceLangFromMaterial(
    pack.manifest.id,
    pack.manifest.sourceLang
  );
  if (inferredLang !== pack.manifest.sourceLang) {
    pack.manifest.sourceLang = inferredLang as SupportedLanguage;
    const levels = defaultLevelForLang(inferredLang);
    if (!pack.manifest.level || pack.manifest.level.startsWith("N")) {
      if (inferredLang !== "ja") {
        pack.manifest.level = levels;
      }
    }
    await saveContentPack(pack);
  }

  if (!options?.force && isFullyParsed(pack)) {
    await pushSyncSafe("already-ready", options?.skipSync);
    return {
      parseStatus: "ready",
      lines: pack.transcript.lines.length,
      message: "已解析完成",
      stage: "done",
    };
  }

  // 强制重解析：清掉 enrichmentMode，重新尝试 LLM
  if (options?.force) {
    pack.manifest.enrichmentMode = undefined;
  }

  // 卡住的 processing 允许重试；新鲜 processing 则跳过（强制除外）
  if (
    !options?.force &&
    pack.manifest.parseStatus === "processing" &&
    !isStaleProcessing(pack)
  ) {
    return {
      parseStatus: "processing",
      lines: pack.transcript.lines.length,
      message: "正在解析中…",
      stage: "acquiring",
    };
  }

  if (activeParses.has(materialId)) {
    return {
      parseStatus: "processing",
      lines: pack.transcript.lines.length,
      message: "后台解析进行中，请稍候刷新",
      stage: "enriching",
    };
  }
  activeParses.add(materialId);

  pack.manifest.parseStatus = "processing";
  pack.manifest.updatedAt = new Date().toISOString();
  await saveContentPack(pack);
  // 导入后立刻推送元数据，便于公司机 → GitHub → Mac 可见（即使尚无字幕）
  await pushSyncSafe("parse-start", options?.skipSync);

  const existingTask = await readAgentTask(materialId);
  const mediaFilename = getMediaFilename(pack.storage);
  const relativeLocalPath = pack.storage.path
    ? getRelativeMediaPath(materialId, path.basename(pack.storage.path))
    : undefined;

  if (existingTask) {
    await updateAgentTaskStatus(materialId, "processing");
  } else {
    await createParseListeningTask({
      id: materialId,
      sourceUrl: pack.manifest.sourceUrl ?? pack.storage.url,
      title: pack.manifest.title,
      sourceLang: pack.manifest.sourceLang,
      level: pack.manifest.level,
      learningGoal: pack.manifest.topics[0] ?? "general",
      localPath: relativeLocalPath,
      mediaFilename,
    });
    await updateAgentTaskStatus(materialId, "processing");
  }

  try {
    let source = "existing";
    let acquireMessage = "";

    // URL 素材：即使已有字幕也尝试下载视频到本地
    const sourceUrl = pack.manifest.sourceUrl ?? pack.storage.url;
    if (sourceUrl && !packHasPlayableLocal(pack)) {
      const media = await ensureMaterialMediaDownload(pack.manifest.id, sourceUrl);
      if (media.ok && media.path) {
        pack.storage.path = media.path;
        pack.storage.url = sourceUrl;
        pack.manifest.sourceUrl = sourceUrl;
        pack.manifest.storage = pack.storage;
        acquireMessage = [acquireMessage, media.message].filter(Boolean).join("；");
        await saveContentPack(pack);
      } else if (media.error) {
        acquireMessage = [acquireMessage, media.error].filter(Boolean).join("；");
      }
    }

    const shouldAcquireSubtitles =
      pack.transcript.lines.length === 0 ||
      (options?.force &&
        !transcriptMatchesSourceLang(
          pack.transcript.lines,
          pack.manifest.sourceLang
        ));

    if (shouldAcquireSubtitles) {
      // 无字幕时默认等人手传；仅用户勾选「允许自动获取」才 Whisper/URL 拉字幕
      if (pack.transcript.lines.length === 0 && !options?.allowAutoSubtitles) {
        const msg =
          "请先手动上传与视频原声语种一致的 SRT/VTT 字幕（推荐）。若确认没有手写字幕、需自动抽取/转写，请在解析对话框勾选「允许自动获取字幕」后再解析。";
        pack.manifest.parseStatus = "pending";
        pack.manifest.updatedAt = new Date().toISOString();
        await saveContentPack(pack);
        await failAgentTask(materialId, msg);
        await pushSyncSafe("await-manual-srt", options?.skipSync);
        return {
          parseStatus: "pending",
          lines: 0,
          source: "awaiting-manual-subtitle",
          message: msg,
          stage: "failed",
        };
      }

      if (
        pack.transcript.lines.length === 0 ||
        (options?.force &&
          options?.allowAutoSubtitles &&
          !transcriptMatchesSourceLang(
            pack.transcript.lines,
            pack.manifest.sourceLang
          ))
      ) {
        const acquired = await acquireSubtitles(pack);
        source = acquired.source;
        acquireMessage = acquired.message;

        if (acquired.lines.length) {
          await applyTranscriptLines(pack, acquired.lines);
          await saveContentPack(pack);
        } else if (pack.transcript.lines.length === 0 || options?.force) {
          const deps = await checkParseDependencies();
          const llm = await getLlmConfig();
          const context = pack.storage.path ? "local" : "url";
          const hints = await formatMissingDependencyHints(
            { ...deps, llmConfigured: Boolean(llm) },
            context,
            pack.manifest.sourceUrl ?? pack.storage.url
          );
          const fullMessage = [acquireMessage, hints].filter(Boolean).join("。");
          if (options?.force) {
            pack.transcript.lines = [];
          }

          pack.manifest.parseStatus = "pending";
          pack.manifest.updatedAt = new Date().toISOString();
          await saveContentPack(pack);
          await failAgentTask(
            materialId,
            fullMessage || "无法获取字幕，等待 Cursor Agent 补全"
          );
          await pushSyncSafe("no-subtitles", options?.skipSync);
          return {
            parseStatus: "pending",
            lines: 0,
            source,
            message: fullMessage,
            stage: "failed",
          };
        }
      }
    }

    // 清洗 BGM/广告/语气词；字幕跟随只保留可学习原声行
    if (pack.transcript.lines.length) {
      const filtered = filterTranscriptForLearning(
        pack.transcript.lines,
        pack.manifest.sourceLang
      );
      if (filtered.skipped > 0) {
        pack.transcript.lines = filtered.kept;
        acquireMessage = [
          acquireMessage,
          `已跳过无用字幕 ${filtered.skipped} 行（BGM/广告/语气词等）`,
        ]
          .filter(Boolean)
          .join("；");
        await saveContentPack(pack);
      }
    }

    const durationSec = transcriptDurationSec(pack.transcript.lines);
    if (
      needsSegmentMinutesConfirm({
        lineCount: pack.transcript.lines.length,
        durationSec,
        segmentMinutes: options?.segmentMinutes,
      })
    ) {
      const msg = `素材较长（约 ${Math.ceil(durationSec / 60)} 分钟 / ${pack.transcript.lines.length} 行），请指定分段解析时长（分钟）后再开始，以节省 Token。`;
      pack.manifest.parseStatus = "pending";
      pack.manifest.updatedAt = new Date().toISOString();
      await saveContentPack(pack);
      await failAgentTask(materialId, msg);
      await pushSyncSafe("await-segment", options?.skipSync);
      return {
        parseStatus: "pending",
        lines: pack.transcript.lines.length,
        source,
        message: msg,
        stage: "failed",
      };
    }

    const window = resolveParseWindow({
      durationSec,
      segmentMinutes: options?.segmentMinutes,
      rangeStartSec: options?.rangeStartSec,
      rangeEndSec: options?.rangeEndSec,
    });

    // 分段：仅对窗口内字幕做词汇/句型解析；跟随字幕仍用全文（已清洗）
    const fullLines = pack.transcript.lines;
    let enrichLines = fullLines;
    if (window) {
      enrichLines = sliceTranscriptByRange(fullLines, window.start, window.end);
      acquireMessage = [
        acquireMessage,
        `分段解析 ${Math.round(window.start)}–${Math.round(window.end)} 秒（${enrichLines.length} 行）`,
      ]
        .filter(Boolean)
        .join("；");
    }

    let llmMessage = "";
    let llmEnriched = false;
    if (needsLlmEnrichment(pack) || options?.offlineOnly) {
      // 临时替换字幕行做增强，再写回全文
      pack.transcript.lines = enrichLines;
      const enrich = await enrichContentPack(pack, {
        offlineOnly: options?.offlineOnly,
        referenceOptions: options?.referenceOptions,
      });
      pack.transcript.lines = fullLines;
      // 去掉基础词残留
      pack.manifest.vocabulary = pack.manifest.vocabulary.filter(
        (v) => !isBasicSkipWord(v.word, pack.manifest.sourceLang)
      );
      llmMessage = enrich.message;
      llmEnriched = enrich.enriched;
      if (enrich.mode) {
        pack.manifest.enrichmentMode = enrich.mode;
      }
      if (!enrich.enriched) {
        pack.manifest.parseStatus = "pending";
        pack.manifest.updatedAt = new Date().toISOString();
        await saveContentPack(pack);
        await failAgentTask(materialId, llmMessage);
        await pushSyncSafe("enrich-failed", options?.skipSync);
        return {
          parseStatus: "pending",
          lines: pack.transcript.lines.length,
          source,
          message: llmMessage,
          stage: "failed",
          llmEnriched: false,
        };
      }
    }

    if (!isPackContentReady(pack)) {
      const message =
        llmMessage || "解析未完成：缺少词汇中文释义或句型语法讲解";
      pack.manifest.parseStatus = "pending";
      pack.manifest.updatedAt = new Date().toISOString();
      await saveContentPack(pack);
      await failAgentTask(materialId, message);
      await pushSyncSafe("not-ready", options?.skipSync);
      return {
        parseStatus: "pending",
        lines: pack.transcript.lines.length,
        source,
        message,
        stage: "failed",
        llmEnriched,
      };
    }

    // 按所选语言水平甄别、去重，并写入 Notebook
    let levelMessage = "";
    try {
      const finalized = finalizeManifestForListen(pack);
      const levelSync = await applyLevelFilterAndNotebook(pack, {
        addToNotebook: true,
        maxNotebookCards: 40,
      });
      levelMessage = `${levelSync.message}；听辨页展示 ${finalized.vocabCount} 词 / ${finalized.patternCount} 句型（已去重）`;
    } catch (err) {
      console.warn("[parse] level filter/notebook skipped:", err);
    }

    pack.manifest.parseStatus = "ready";
    pack.manifest.updatedAt = new Date().toISOString();
    await saveContentPack(pack);

    const syncedPack = await syncMaterialMedia(materialId, pack);
    await saveContentPack(syncedPack);

    await pushSyncSafe("ready", options?.skipSync);
    await completeAgentTask(materialId);

    return {
      parseStatus: "ready",
      lines: pack.transcript.lines.length,
      source,
      message:
        [acquireMessage, llmMessage, levelMessage]
          .filter(Boolean)
          .join("；") || "解析完成",
      stage: "done",
      llmEnriched,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "解析失败";
    pack.manifest.parseStatus = "pending";
    pack.manifest.updatedAt = new Date().toISOString();
    await saveContentPack(pack);
    await failAgentTask(materialId, message);
    await pushSyncSafe("error", options?.skipSync);
    return {
      parseStatus: "pending",
      lines: pack.transcript.lines.length,
      message,
      stage: "failed",
    };
  } finally {
    activeParses.delete(materialId);
  }
}

export function triggerParseInBackground(
  materialId: string,
  options?: ParseMaterialOptions
): void {
  if (
    activeParses.has(materialId) ||
    parseQueue.some((j) => j.id === materialId)
  ) {
    return;
  }
  parseQueue.push({ id: materialId, options });
  void drainParseQueue();
}
