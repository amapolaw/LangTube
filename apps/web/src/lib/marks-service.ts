import fs from "fs";
import path from "path";
import type { MaterialMarks, MarksStore } from "@langtube/core";
import { getUserDir } from "./paths";

function getMarksPath() {
  return path.join(getUserDir(), "marks.json");
}

function ensureUserDir() {
  const dir = getUserDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readStore(): MarksStore {
  ensureUserDir();
  try {
    return JSON.parse(fs.readFileSync(getMarksPath(), "utf-8")) as MarksStore;
  } catch {
    return {};
  }
}

function writeStore(store: MarksStore) {
  ensureUserDir();
  fs.writeFileSync(getMarksPath(), JSON.stringify(store, null, 2));
}

export function getAllMarks(): MarksStore {
  return readStore();
}

export function getMaterialMarks(materialId: string): MaterialMarks {
  const store = readStore();
  return (
    store[materialId] ?? {
      lines: [],
      vocabulary: [],
      patterns: [],
      updatedAt: new Date().toISOString(),
    }
  );
}

export function saveMaterialMarks(
  materialId: string,
  marks: Partial<MaterialMarks>
): MaterialMarks {
  const store = readStore();
  const existing = getMaterialMarks(materialId);
  const updated: MaterialMarks = {
    lines: marks.lines ?? existing.lines,
    vocabulary: marks.vocabulary ?? existing.vocabulary,
    patterns: marks.patterns ?? existing.patterns,
    updatedAt: new Date().toISOString(),
  };
  store[materialId] = updated;
  writeStore(store);
  return updated;
}

export function toggleMark(
  materialId: string,
  category: "lines" | "vocabulary" | "patterns",
  itemId: string
): MaterialMarks {
  const marks = getMaterialMarks(materialId);
  const list = [...marks[category]];
  const idx = list.indexOf(itemId);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(itemId);
  return saveMaterialMarks(materialId, { [category]: list });
}

export function deleteMaterialMarks(materialId: string) {
  const store = readStore();
  delete store[materialId];
  writeStore(store);
}
