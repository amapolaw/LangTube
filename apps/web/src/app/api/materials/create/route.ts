import { NextResponse } from "next/server";
import {
  generateId,
  mergeIndexEntry,
  type MaterialManifest,
  type StorageConfig,
} from "@langtube/core";
import { readIndex, writeIndex, saveContentPack } from "@/lib/data";
import { createParseListeningTask } from "@/lib/agent-task-service";
import { pushLearningData } from "@/lib/github-sync";
import fs from "fs/promises";
import { getMaterialDir } from "@/lib/paths";

export async function POST(req: Request) {
  const body = await req.json();
  const title = body.title || "Untitled";
  const sourceLang = body.sourceLang || "ja";
  const nativeLang = body.nativeLang || "zh";
  const level = body.level || "N3";
  const learningGoal = body.learningGoal ?? "general";
  const now = new Date().toISOString();
  const id = generateId(title, sourceLang);

  const storage: StorageConfig = { mode: "local", provider: "local" };
  const manifest: MaterialManifest = {
    id,
    title,
    sourceLang,
    nativeLang,
    level,
    topics: [learningGoal],
    storage,
    segments: { extensive: [], intensive: [] },
    vocabulary: [],
    patterns: [],
    parseStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };

  const pack = {
    manifest,
    transcript: { materialId: id, lines: [] },
    segments: manifest.segments,
    storage,
  };

  await fs.mkdir(getMaterialDir(id), { recursive: true });
  await saveContentPack(pack);
  const index = await readIndex();
  await writeIndex(mergeIndexEntry(index, manifest));

  await createParseListeningTask({
    id,
    sourceUrl: body.sourceUrl ?? null,
    title,
    sourceLang,
    level,
    learningGoal,
  });

  try {
    await pushLearningData();
  } catch (err) {
    console.error("[create] push failed:", err);
  }

  // 不自动解析：等人手传 SRT 或在 UI 确认后再解析（省 Token）
  return NextResponse.json({
    id,
    manifest,
    awaitManualSubtitle: true,
    message:
      "卡片已创建。请先上传与原声语种一致的 SRT 字幕，或在「准备解析」中确认后再开始。",
  });
}
