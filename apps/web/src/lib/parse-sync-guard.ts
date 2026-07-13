import { readIndex } from "@/lib/data";
import { getDeletedMaterialIds } from "@/lib/deletions-registry";

/** 是否有素材正在解析（用于暂停自动 GitHub pull） */
export async function hasActiveMaterialParsing(): Promise<boolean> {
  const [index, deleted] = await Promise.all([
    readIndex(),
    getDeletedMaterialIds(),
  ]);
  return index.materials.some(
    (m) => !deleted.has(m.id) && m.parseStatus === "processing"
  );
}

export async function describeParseSyncSkip(): Promise<string | null> {
  if (await hasActiveMaterialParsing()) {
    return "素材解析进行中，已跳过 GitHub 自动拉取";
  }
  return null;
}

export async function describeParseSyncPushBlock(): Promise<string | null> {
  if (await hasActiveMaterialParsing()) {
    return "素材解析进行中，请待全部解析完成后再推送到 GitHub";
  }
  return null;
}
