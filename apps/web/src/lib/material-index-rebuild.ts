import { mergeIndexEntry, type MaterialIndex, type MaterialIndexEntry, type Transcript, type TranscriptLine } from "@langtube/core";
import fs from "fs/promises";
import path from "path";
import {
  readIndex,
  writeIndex,
  readManifest,
  listMaterialIds,
} from "@/lib/data";
import { getMaterialDir } from "@/lib/paths";
import { getDeletedMaterialIds } from "@/lib/deletions-registry";

function isCorruptedMaterialEntry(entry: MaterialIndexEntry): boolean {
  const blob = `${entry.id} ${entry.title}`;
  return (
    blob.includes("\uFFFD") ||
    /ä¿|é¼|åŠ|ç§|ã/.test(blob) ||
    /\?/.test(entry.id.split("-").slice(1).join("-"))
  );
}

function materialSuffixKey(id: string): string {
  const last = id.split("-").pop() ?? id;
  if (/^mr[a-z0-9]+$/.test(last)) return last;
  if (id === "ted-ja-social-engineering-001") return id;
  return id;
}

/** 合并 GitHub 拉取时因编码损坏产生的重复素材 id */
export function dedupeIndexMaterials(
  materials: MaterialIndexEntry[]
): MaterialIndexEntry[] {
  const groups = new Map<string, MaterialIndexEntry[]>();
  for (const m of materials) {
    const key = materialSuffixKey(m.id);
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }

  const out: MaterialIndexEntry[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }
    const preferred =
      list.find((m) => !isCorruptedMaterialEntry(m)) ??
      list.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
    out.push(preferred);
  }

  return out.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * 从 data/materials 下各目录的 manifest.json 恢复 index 条目
 */
export async function rebuildMaterialIndex(): Promise<{
  total: number;
  recovered: number;
}> {
  const index = await readIndex();
  const deleted = await getDeletedMaterialIds();
  const ids = await listMaterialIds();
  const before = new Set(index.materials.map((m) => m.id));
  let recovered = 0;

  for (const id of ids) {
    if (deleted.has(id)) continue;
    const manifest = await readManifest(id);
    if (!manifest) continue;

    const existing = index.materials.find((m) => m.id === id);
    if (!existing) {
      mergeIndexEntry(index, manifest);
      recovered += 1;
      continue;
    }

    const manifestTs = new Date(manifest.updatedAt).getTime();
    const indexTs = new Date(existing.updatedAt).getTime();
    if (
      Number.isNaN(indexTs) ||
      (!Number.isNaN(manifestTs) && manifestTs >= indexTs)
    ) {
      mergeIndexEntry(index, manifest);
      if (!before.has(id)) recovered += 1;
    }
  }

  index.materials = index.materials.filter((m) => !deleted.has(m.id));
  index.materials.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  index.materials = dedupeIndexMaterials(index.materials);

  await writeIndex(index);
  return { total: index.materials.length, recovered };
}

export function mergeMaterialIndexes(
  local: MaterialIndex,
  remote: MaterialIndex,
  deletedIds: Set<string> = new Set()
): MaterialIndex {
  const byId = new Map(
    local.materials.filter((m) => !deletedIds.has(m.id)).map((m) => [m.id, m])
  );

  for (const m of remote.materials ?? []) {
    if (deletedIds.has(m.id)) continue;
    const existing = byId.get(m.id);
    if (!existing) {
      byId.set(m.id, m);
      continue;
    }
    const localTs = new Date(existing.updatedAt).getTime();
    const remoteTs = new Date(m.updatedAt).getTime();
    if (Number.isNaN(localTs) || remoteTs >= localTs) {
      byId.set(m.id, m);
    }
  }

  const materials = dedupeIndexMaterials(
    Array.from(byId.values()).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  );

  return {
    version: remote.version ?? local.version ?? 1,
    materials,
  };
}

/**
 * 从 manifest.patterns 恢复丢失的 transcript.json（pattern 文本即原句）。
 * 时间轴按视频时长线性估算，供页面先可用；后续可用 Whisper 重解析覆盖。
 */
export async function recoverTranscriptFromManifestPatterns(
  materialId: string,
  durationSec?: number
): Promise<{ recovered: boolean; lines: number; message: string }> {
  const manifest = await readManifest(materialId);
  if (!manifest?.patterns?.length) {
    return { recovered: false, lines: 0, message: "manifest 无 patterns，无法恢复" };
  }

  const transcriptPath = path.join(getMaterialDir(materialId), "transcript.json");
  try {
    const existing = await fs.readFile(transcriptPath, "utf-8");
    const parsed = JSON.parse(existing) as Transcript;
    if (parsed.lines?.length) {
      return {
        recovered: false,
        lines: parsed.lines.length,
        message: "transcript 已有字幕，跳过恢复",
      };
    }
  } catch {
    // 继续恢复
  }

  let duration = durationSec ?? 0;
  if (!duration) {
    const intensive = manifest.segments?.intensive?.[0];
    duration = intensive?.end ?? manifest.segments?.extensive?.[0]?.end ?? 0;
  }
  if (!duration) duration = manifest.patterns.length * 2.5;

  const patterns = [...manifest.patterns].sort((a, b) => {
    const ai = Number(a.id.replace("pattern-", ""));
    const bi = Number(b.id.replace("pattern-", ""));
    return ai - bi;
  });

  const step = duration / Math.max(patterns.length, 1);
  const lines: TranscriptLine[] = patterns.map((p, i) => ({
    id: `line-${i + 1}`,
    start: i * step,
    end: (i + 1) * step,
    text: p.pattern.trim(),
    translation: (p.zh || "").trim(),
  }));

  const transcript: Transcript = { materialId, lines };
  await fs.writeFile(transcriptPath, JSON.stringify(transcript, null, 2));

  return {
    recovered: true,
    lines: lines.length,
    message: `已从 patterns 恢复 ${lines.length} 条字幕（估算时间轴）`,
  };
}
