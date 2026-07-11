import type { ContentPack, MaterialIndexEntry } from "@langtube/core";

export const MATERIAL_LANGUAGES = [
  { value: "en", label: "英语" },
  { value: "ja", label: "日语" },
  { value: "es", label: "西班牙语" },
  { value: "fr", label: "法语" },
] as const;

export const MATERIAL_LEVELS: Record<string, string[]> = {
  en: ["A1", "A2", "B1", "B2", "C1", "C2"],
  ja: ["N5", "N4", "N3", "N2", "N1"],
  es: ["A1", "A2", "B1", "B2", "C1", "C2"],
  fr: ["A1", "A2", "B1", "B2", "C1", "C2"],
};

export interface MaterialImportFormValues {
  title: string;
  sourceUrl: string;
  level: string;
  learningGoal: string;
  storageMode: string;
  storageProvider: string;
  transcriptText: string;
}

/** 从素材 id 前缀推断语言（如 es-coco-xxx → es，ted-ja-xxx → ja） */
export function sourceLangFromMaterial(id: string, sourceLang: string): string {
  const parts = id.split("-");
  if (["en", "ja", "es", "fr"].includes(parts[0])) return parts[0];
  const embedded = parts.find((p) =>
    ["en", "ja", "es", "fr"].includes(p)
  );
  if (embedded) return embedded;
  return sourceLang;
}

export function learningGoalFromTopics(topics: string[]): string {
  return topics.find((t) => !t.startsWith("level:")) ?? "general";
}

export function defaultLevelForLang(lang: string): string {
  const levels = MATERIAL_LEVELS[lang] ?? MATERIAL_LEVELS.en;
  return levels[Math.min(2, levels.length - 1)] ?? "B1";
}

export function formDefaultsFromPack(pack: ContentPack): MaterialImportFormValues & {
  sourceLang: string;
} {
  return {
    sourceLang: sourceLangFromMaterial(
      pack.manifest.id,
      pack.manifest.sourceLang
    ),
    title: pack.manifest.title,
    sourceUrl: pack.manifest.sourceUrl ?? "",
    level: pack.manifest.level,
    learningGoal: learningGoalFromTopics(pack.manifest.topics),
    storageMode: pack.storage.mode,
    storageProvider: pack.storage.provider,
    transcriptText: "",
  };
}

export function formDefaultsFromIndex(
  entry: MaterialIndexEntry
): MaterialImportFormValues & { sourceLang: string } {
  const lang = sourceLangFromMaterial(entry.id, entry.sourceLang);
  return {
    sourceLang: lang,
    title: entry.title,
    sourceUrl: entry.sourceUrl ?? "",
    level: entry.level || defaultLevelForLang(lang),
    learningGoal: learningGoalFromTopics(entry.topics),
    storageMode: "local",
    storageProvider: entry.storageLocation,
    transcriptText: "",
  };
}

export function appendImportFormFields(
  fd: FormData,
  values: MaterialImportFormValues & { sourceLang: string },
  materialId?: string
): void {
  fd.append("sourceLang", values.sourceLang);
  fd.append("nativeLang", "zh");
  fd.append("title", values.title);
  fd.append("sourceUrl", values.sourceUrl);
  fd.append("level", values.level);
  fd.append("learningGoal", values.learningGoal);
  fd.append("storageMode", values.storageMode);
  fd.append("storageProvider", values.storageProvider);
  fd.append("transcriptText", values.transcriptText);
  if (materialId) fd.append("materialId", materialId);
}
