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

function isFullyParsed(pack: ContentPack): boolean {
  if (pack.manifest.parseStatus !== "ready" || !isPackContentReady(pack)) {
    return false;
  }
  const lines = pack.transcript.lines;
  if (!lines.length) return true;
  const translated = lines.filter((l) => l.translation?.trim()).length;
  if (
    pack.manifest.enrichmentMode === "rules" &&
    translated < lines.length * 0.3
  ) {
    return false;
  }
  return true;
}

function isStaleProcessing(pack: ContentPack): boolean {
  if (pack.manifest.parseStatus !== "processing") return false;
  const updated = new Date(pack.manifest.updatedAt).getTime();
  if (Number.isNaN(updated)) return true;
  return Date.now() - updated > STALE_PROCESSING_MS;
}

async function pushSyncSafe(reason: string): Promise<void> {
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
  options?: { force?: boolean }
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
    await pushSyncSafe("already-ready");
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
  await pushSyncSafe("parse-start");

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
        await pushSyncSafe("no-subtitles");
        return {
          parseStatus: "pending",
          lines: 0,
          source,
          message: fullMessage,
          stage: "failed",
        };
      }
    }

    let llmMessage = "";
    let llmEnriched = false;
    if (needsLlmEnrichment(pack)) {
      const enrich = await enrichContentPack(pack);
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
        await pushSyncSafe("enrich-failed");
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
      await pushSyncSafe("not-ready");
      return {
        parseStatus: "pending",
        lines: pack.transcript.lines.length,
        source,
        message,
        stage: "failed",
        llmEnriched,
      };
    }

    // 按所选语言水平，对照 Language 参考资料甄别，并写入 Notebook
    let levelMessage = "";
    try {
      const levelSync = await applyLevelFilterAndNotebook(pack, {
        addToNotebook: true,
        maxNotebookCards: 40,
      });
      levelMessage = levelSync.message;
    } catch (err) {
      console.warn("[parse] level filter/notebook skipped:", err);
    }

    pack.manifest.parseStatus = "ready";
    pack.manifest.updatedAt = new Date().toISOString();
    await saveContentPack(pack);

    const syncedPack = await syncMaterialMedia(materialId, pack);
    await saveContentPack(syncedPack);

    await pushSyncSafe("ready");
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
    await pushSyncSafe("error");
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
  options?: { force?: boolean }
): void {
  parseMaterial(materialId, options).catch((err) => {
    console.error(`Background parse failed for ${materialId}:`, err);
  });
}
