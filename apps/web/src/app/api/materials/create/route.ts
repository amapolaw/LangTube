import { NextResponse } from "next/server";
import {
  generateId,
  mergeIndexEntry,
  type MaterialManifest,
  type StorageConfig,
} from "@langtube/core";
import { readIndex, writeIndex, saveContentPack } from "@/lib/data";
import fs from "fs/promises";
import { getMaterialDir } from "@/lib/paths";

export async function POST(req: Request) {
  const body = await req.json();
  const title = body.title || "Untitled";
  const sourceLang = body.sourceLang || "ja";
  const nativeLang = body.nativeLang || "zh";
  const level = body.level || "N3";
  const now = new Date().toISOString();
  const id = generateId(title, sourceLang);

  const storage: StorageConfig = { mode: "local", provider: "local" };
  const manifest: MaterialManifest = {
    id,
    title,
    sourceLang,
    nativeLang,
    level,
    topics: [body.learningGoal ?? "general"],
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

  return NextResponse.json({ id, manifest });
}
