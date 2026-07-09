import { NextResponse } from "next/server";
import {
  generateId,
  mergeIndexEntry,
  type MaterialManifest,
  type StorageConfig,
} from "@langtube/core";
import {
  readIndex,
  writeIndex,
  saveContentPack,
  saveUploadedFile,
} from "@/lib/data";
import {
  extractVocabulary,
  extractPatterns,
  parseTranscriptText,
} from "@/lib/vocab-extract";
import { fetchSubtitlesFromUrl } from "@/lib/subtitle-fetcher";
import fs from "fs/promises";
import path from "path";
import { getMaterialDir } from "@/lib/paths";

export async function POST(req: Request) {
  const formData = await req.formData();
  const sourceType = formData.get("sourceType") as string;
  const title = (formData.get("title") as string) || "Untitled";
  const sourceLang = (formData.get("sourceLang") as string) || "ja";
  const nativeLang = (formData.get("nativeLang") as string) || "zh";
  const level = (formData.get("level") as string) || "N3";
  const learningGoal = (formData.get("learningGoal") as string) || "general";
  const storageMode = (formData.get("storageMode") as string) || "local";
  const storageProvider = (formData.get("storageProvider") as string) || "local";
  const sourceUrl = formData.get("sourceUrl") as string | null;
  const transcriptText = formData.get("transcriptText") as string | null;
  const linkMaterialId = formData.get("materialId") as string | null;

  const id = linkMaterialId || generateId(title, sourceLang);
  const now = new Date().toISOString();

  let storage: StorageConfig = {
    mode: storageMode as StorageConfig["mode"],
    provider: storageProvider as StorageConfig["provider"],
  };

  const materialDir = getMaterialDir(id);
  await fs.mkdir(materialDir, { recursive: true });

  if (sourceType === "upload") {
    const file = formData.get("file") as File | null;
    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const filePath = await saveUploadedFile(id, file.name, buffer);
      storage = { mode: "local", provider: "local", path: filePath };
    }
  } else if (sourceType === "url" && sourceUrl) {
    storage = {
      mode: storageMode as StorageConfig["mode"],
      provider: storageProvider as StorageConfig["provider"],
      url: sourceUrl,
    };
  }

  let lines = parseTranscriptText(transcriptText ?? "");
  if (!lines.length && sourceUrl) {
    lines = await fetchSubtitlesFromUrl(sourceUrl);
  }

  const duration = lines.length > 0 ? lines[lines.length - 1].end : 600;

  const manifest: MaterialManifest = {
    id,
    title,
    sourceLang: sourceLang as MaterialManifest["sourceLang"],
    nativeLang: nativeLang as MaterialManifest["nativeLang"],
    level,
    topics: [learningGoal],
    sourceUrl: sourceUrl ?? undefined,
    storage,
    segments: {
      extensive: [
        {
          start: 0,
          end: Math.min(180, duration),
          reason: "开头部分适合泛听，建立整体语境",
          durationMinutes: 3,
        },
      ],
      intensive: [
        {
          start: Math.min(60, duration * 0.3),
          end: Math.min(duration, duration * 0.6 + 120),
          reason: "核心段落句型密集，适合精听",
          durationMinutes: 10,
        },
      ],
    },
    vocabulary: extractVocabulary(lines, sourceLang as MaterialManifest["sourceLang"]),
    patterns: extractPatterns(lines),
    parseStatus: lines.length > 0 ? "ready" : "pending",
    createdAt: now,
    updatedAt: now,
  };

  const pack = {
    manifest,
    transcript: { materialId: id, lines },
    segments: manifest.segments,
    storage,
  };

  await saveContentPack(pack);

  if (manifest.parseStatus === "pending") {
    const agentTask = {
      id,
      type: "parse-listening",
      status: "pending",
      input: { sourceUrl, title, sourceLang, level, learningGoal },
      createdAt: now,
    };
    await fs.mkdir(path.join(materialDir, "..", "..", "agent-tasks"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(materialDir, "..", "..", "agent-tasks", `${id}.json`),
      JSON.stringify(agentTask, null, 2)
    );
  }

  const index = await readIndex();
  await writeIndex(mergeIndexEntry(index, manifest));

  return NextResponse.json({ id, manifest, parseStatus: manifest.parseStatus });
}
