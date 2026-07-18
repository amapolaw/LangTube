import { NextResponse } from "next/server";
import {
  generateId,
  mergeIndexEntry,
  type MaterialManifest,
  type StorageConfig,
  type TranscriptLine,
} from "@langtube/core";
import {
  readIndex,
  writeIndex,
  saveContentPack,
  saveUploadedFile,
  readContentPack,
} from "@/lib/data";
import {
  extractVocabulary,
  extractPatterns,
  isLikelyWordNotPhrase,
  parseTranscriptText,
} from "@/lib/vocab-extract";
import { fetchSubtitlesFromUrlDetailed } from "@/lib/subtitle-fetcher";
import {
  extractTextSubtitlesFromLocal,
  transcribeAudioSubtitles,
  parseSrt,
  parseVtt,
} from "@/lib/subtitle-extractor";
import { parseMaterial } from "@/lib/material-parser";
import { pushLearningData } from "@/lib/github-sync";
import { learningGoalFromTopics } from "@/lib/material-form";
import {
  isLongMaterial,
  transcriptDurationSec,
} from "@/lib/parse-token-policy";
import fs from "fs/promises";
import path from "path";
import { getMaterialDir } from "@/lib/paths";

function isSubtitleExt(ext: string): boolean {
  return ext === ".srt" || ext === ".vtt" || ext === ".txt";
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const sourceType = formData.get("sourceType") as string;
  const title = (formData.get("title") as string) || "Untitled";
  const sourceLang = (formData.get("sourceLang") as string) || "ja";
  const nativeLang = (formData.get("nativeLang") as string) || "zh";
  const level = (formData.get("level") as string) || "N3";
  const learningGoal = (formData.get("learningGoal") as string) || "general";
  const storageMode = (formData.get("storageMode") as string) || "local";
  const storageProvider =
    (formData.get("storageProvider") as string) || "local";
  const sourceUrl = formData.get("sourceUrl") as string | null;
  const transcriptText = formData.get("transcriptText") as string | null;
  const linkMaterialId = formData.get("materialId") as string | null;
  const startParse = formData.get("startParse") === "true";
  const allowAutoSubtitles = formData.get("allowAutoSubtitles") === "true";
  const segmentMinutesRaw = formData.get("segmentMinutes");
  const segmentMinutes = segmentMinutesRaw
    ? Number(segmentMinutesRaw)
    : undefined;

  const videoFile = formData.get("videoFile") as File | null;
  const subtitleFile = formData.get("subtitleFile") as File | null;
  const legacyFile = formData.get("file") as File | null;

  const id = linkMaterialId || generateId(title, sourceLang);
  const now = new Date().toISOString();
  const existingPack = linkMaterialId ? await readContentPack(linkMaterialId) : null;

  let storage: StorageConfig = existingPack?.storage ?? {
    mode: storageMode as StorageConfig["mode"],
    provider: storageProvider as StorageConfig["provider"],
  };

  const materialDir = getMaterialDir(id);
  await fs.mkdir(materialDir, { recursive: true });

  let uploadedVideoPath: string | null = null;
  let uploadedSubtitleLines: TranscriptLine[] = [];
  let hasNewSubtitle = false;

  const resolvedVideoFile =
    videoFile ||
    (legacyFile &&
    !isSubtitleExt(path.extname(legacyFile.name).toLowerCase())
      ? legacyFile
      : null);
  const resolvedSubtitleFile =
    subtitleFile ||
    (legacyFile &&
    isSubtitleExt(path.extname(legacyFile.name).toLowerCase())
      ? legacyFile
      : null);

  if (sourceType === "upload") {
    if (resolvedVideoFile?.size) {
      const buffer = Buffer.from(await resolvedVideoFile.arrayBuffer());
      const filePath = await saveUploadedFile(id, resolvedVideoFile.name, buffer);
      storage = {
        mode: storageMode as StorageConfig["mode"],
        provider: storageProvider as StorageConfig["provider"],
        path: filePath,
      };
      uploadedVideoPath = filePath;
    }

    if (resolvedSubtitleFile?.size) {
      const ext = path.extname(resolvedSubtitleFile.name).toLowerCase();
      const content = await resolvedSubtitleFile.text();
      uploadedSubtitleLines =
        ext === ".vtt"
          ? parseVtt(content)
          : ext === ".srt"
            ? parseSrt(content)
            : parseTranscriptText(content);
      await saveUploadedFile(
        id,
        resolvedSubtitleFile.name,
        Buffer.from(content, "utf-8")
      );
      hasNewSubtitle = uploadedSubtitleLines.length > 0;
    }

    if (
      !resolvedVideoFile?.size &&
      !resolvedSubtitleFile?.size &&
      !linkMaterialId
    ) {
      return NextResponse.json(
        { error: "请至少上传视频或字幕文件" },
        { status: 400 }
      );
    }
  } else if (sourceType === "url" && sourceUrl) {
    storage = {
      mode: storageMode as StorageConfig["mode"],
      provider: storageProvider as StorageConfig["provider"],
      url: sourceUrl,
    };
  }

  const resolvedSourceUrl =
    sourceUrl ?? existingPack?.manifest.sourceUrl ?? storage.url;

  // 字幕：新上传优先，否则保留已有，再尝试 URL/视频提取
  let lines: TranscriptLine[] = existingPack?.transcript.lines ?? [];

  if (hasNewSubtitle) {
    lines = uploadedSubtitleLines;
  } else if (parseTranscriptText(transcriptText ?? "").length) {
    lines = parseTranscriptText(transcriptText ?? "");
    hasNewSubtitle = true;
  }

  const localVideo = uploadedVideoPath || storage.path;
  // 默认不自动 Whisper/抽内嵌字幕：等用户确认或手传 SRT（省 Token）
  if (!lines.length && localVideo && allowAutoSubtitles) {
    const textSubs = await extractTextSubtitlesFromLocal(localVideo);
    lines = textSubs.lines;
    if (!lines.length) {
      const audio = await transcribeAudioSubtitles(
        localVideo,
        sourceLang as MaterialManifest["sourceLang"]
      );
      lines = audio.lines;
    }
  }

  if (!lines.length && sourceUrl && allowAutoSubtitles) {
    const fetched = await fetchSubtitlesFromUrlDetailed(
      sourceUrl,
      sourceLang,
      nativeLang
    );
    lines = fetched.lines;
  }

  const duration =
    lines.length > 0
      ? lines[lines.length - 1].end
      : existingPack?.manifest.segments?.extensive?.[0]?.end ?? 600;

  const prevGoal = existingPack
    ? learningGoalFromTopics(existingPack.manifest.topics)
    : learningGoal;

  const manifest: MaterialManifest = {
    id,
    title: title || existingPack?.manifest.title || "Untitled",
    sourceLang: sourceLang as MaterialManifest["sourceLang"],
    nativeLang: nativeLang as MaterialManifest["nativeLang"],
    level,
    topics: [learningGoal || prevGoal],
    sourceUrl: resolvedSourceUrl ?? undefined,
    storage,
    segments:
      lines.length > 0
        ? {
            extensive: [
              {
                start: 0,
                end: duration,
                reason: "全片字幕跟随，适合泛听建立整体语境",
                durationMinutes: Math.max(1, Math.round(duration / 60)),
              },
            ],
            intensive: [
              {
                start: Math.min(60, duration * 0.3),
                end: duration,
                reason: "默认可精听全片；可用开始/结束秒收窄区间",
                durationMinutes: Math.max(1, Math.round(duration / 60)),
              },
            ],
          }
        : (existingPack?.manifest.segments ?? {
            extensive: [
              {
                start: 0,
                end: duration,
                reason: "全片字幕跟随，适合泛听建立整体语境",
                durationMinutes: Math.max(1, Math.round(duration / 60)),
              },
            ],
            intensive: [
              {
                start: Math.min(60, duration * 0.3),
                end: duration,
                reason: "默认可精听全片；可用开始/结束秒收窄区间",
                durationMinutes: Math.max(1, Math.round(duration / 60)),
              },
            ],
          }),
    vocabulary:
      lines.length &&
      sourceLang !== "ja" &&
      sourceLang !== "es" &&
      sourceLang !== "fr"
        ? (
            await extractVocabulary(
              lines,
              sourceLang as MaterialManifest["sourceLang"]
            )
          ).filter((v) =>
            isLikelyWordNotPhrase(
              v.word,
              sourceLang as MaterialManifest["sourceLang"]
            )
          )
        : sourceLang === "ja" || sourceLang === "es" || sourceLang === "fr"
          ? []
          : (existingPack?.manifest.vocabulary ?? []),
    patterns:
      lines.length &&
      sourceLang !== "ja" &&
      sourceLang !== "es" &&
      sourceLang !== "fr"
        ? extractPatterns(lines, sourceLang as MaterialManifest["sourceLang"])
        : sourceLang === "ja" || sourceLang === "es" || sourceLang === "fr"
          ? []
          : (existingPack?.manifest.patterns ?? []),
    parseStatus: "pending",
    enrichmentMode: hasNewSubtitle ? undefined : existingPack?.manifest.enrichmentMode,
    createdAt: existingPack?.manifest.createdAt ?? now,
    updatedAt: now,
  };

  const pack = {
    manifest,
    transcript: { materialId: id, lines },
    segments: manifest.segments,
    storage,
  };

  await saveContentPack(pack);

  const index = await readIndex();
  await writeIndex(mergeIndexEntry(index, manifest));

  try {
    await pushLearningData();
  } catch (err) {
    console.error("[import] push failed:", err);
  }

  const durationSec = transcriptDurationSec(lines);
  const longMaterial = isLongMaterial({
    lineCount: lines.length,
    durationSec,
  });
  const onlyVideoNoSubtitle =
    Boolean(resolvedVideoFile?.size) && !hasNewSubtitle && !lines.length;

  if (!startParse) {
    return NextResponse.json({
      id,
      manifest,
      parseStatus: "pending",
      lines: lines.length,
      awaitManualSubtitle: onlyVideoNoSubtitle || (!lines.length && !hasNewSubtitle),
      needsSegmentConfirm: longMaterial,
      durationSec,
      message: onlyVideoNoSubtitle
        ? "视频已上传。请上传与原声语种一致的 SRT，或确认允许自动获取字幕后再解析。"
        : hasNewSubtitle
          ? `字幕已导入（${lines.length} 行）。请确认分段时长后开始解析。`
          : lines.length
            ? `已有字幕 ${lines.length} 行。请确认后开始解析。`
            : "资源已保存。请上传 SRT 或在「准备解析」中确认后再开始。",
    });
  }

  const parseResult = await parseMaterial(id, {
    force: true,
    allowAutoSubtitles,
    segmentMinutes:
      Number.isFinite(segmentMinutes) && (segmentMinutes as number) > 0
        ? segmentMinutes
        : undefined,
  });
  const finalPack = await readContentPack(id);

  return NextResponse.json({
    id,
    manifest: finalPack?.manifest ?? manifest,
    parseStatus: parseResult.parseStatus,
    message: parseResult.message,
    lines: parseResult.lines,
  });
}
