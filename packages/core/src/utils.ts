import type { ContentPack, MaterialIndex, MaterialManifest } from "./types.js";

export function validateManifest(manifest: MaterialManifest): string[] {
  const errors: string[] = [];
  if (!manifest.id) errors.push("manifest.id is required");
  if (!manifest.title) errors.push("manifest.title is required");
  if (!manifest.sourceLang) errors.push("manifest.sourceLang is required");
  if (!manifest.vocabulary?.length && !manifest.patterns?.length) {
    errors.push("At least vocabulary or patterns required");
  }
  return errors;
}

export function validateContentPack(pack: ContentPack): string[] {
  const errors = validateManifest(pack.manifest);
  if (!pack.transcript?.lines?.length) {
    errors.push("transcript.lines is required and must not be empty");
  }
  if (!pack.segments?.extensive?.length && !pack.segments?.intensive?.length) {
    errors.push("At least one extensive or intensive segment required");
  }
  if (pack.manifest.id !== pack.transcript.materialId) {
    errors.push("manifest.id must match transcript.materialId");
  }
  return errors;
}

export function mergeIndexEntry(
  index: MaterialIndex,
  manifest: MaterialManifest
): MaterialIndex {
  const entry = {
    id: manifest.id,
    title: manifest.title,
    sourceLang: manifest.sourceLang,
    nativeLang: manifest.nativeLang,
    level: manifest.level,
    topics: manifest.topics,
    storageLocation: manifest.storage.provider,
    parseStatus: manifest.parseStatus,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    sourceUrl: manifest.sourceUrl,
  };

  const existing = index.materials.findIndex((m) => m.id === manifest.id);
  if (existing >= 0) {
    index.materials[existing] = entry;
  } else {
    index.materials.push(entry);
  }
  return index;
}

export function generateId(title: string, lang: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .slice(0, 40);
  return `${lang}-${slug}-${Date.now().toString(36)}`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function textSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^\w\s\u3040-\u30ff\u4e00-\u9fff]/g, "").trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  let matches = 0;
  const wordsA = na.split(/\s+/);
  const wordsB = new Set(nb.split(/\s+/));
  for (const w of wordsA) {
    if (wordsB.has(w)) matches++;
  }
  return matches / Math.max(wordsA.length, wordsB.size);
}
