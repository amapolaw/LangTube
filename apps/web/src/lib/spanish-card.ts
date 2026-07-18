import type { PatternItem, VocabularyItem } from "@langtube/core";
import { conjugationDictUrl } from "@/lib/parse-rules";
import { guessSpanishLemma } from "@/lib/spanish-lemmatize";
import {
  patternDisplayZh,
  vocabDisplayZh,
} from "@/lib/japanese-card";

function surfaceFromNotes(notes?: string): string | undefined {
  const m = notes?.match(/字幕形[：:]\s*(.+)$/);
  return m?.[1]?.trim();
}

/** 与 es-coco 卡片一致：逗号分隔中文释义 */
function formatEsZh(zh?: string): string | undefined {
  const t = zh?.trim();
  if (!t) return undefined;
  return t
    .replace(/[；;]+/g, ",")
    .replace(/\s*,\s*/g, ",")
    .replace(/,+/g, ",")
    .replace(/^,|,$/g, "");
}

/** 写入 manifest / 听辨卡片前规范化西语词条（原形 + 中文 + 字幕形 notes） */
export function normalizeEsVocabCard(item: VocabularyItem): VocabularyItem {
  const surface =
    surfaceFromNotes(item.notes) ||
    (item.word.trim().toLowerCase() !==
    (item.lemma?.trim() || item.word).trim().toLowerCase()
      ? item.word.trim()
      : undefined);

  const lemma = guessSpanishLemma(
    item.lemma?.trim() || surface || item.word
  ).trim();
  const word = lemma || item.word.trim();
  const zh = formatEsZh(vocabDisplayZh(item, "es"));

  let notes = item.notes?.trim();
  if (surface && surface.toLowerCase() !== word.toLowerCase()) {
    notes = `字幕形：${surface}`;
  } else if (notes && !notes.startsWith("字幕形")) {
    /* keep custom notes */
  } else {
    notes = undefined;
  }

  return {
    ...item,
    word,
    lemma: word,
    zh: zh ?? item.zh,
    dictUrl: item.dictUrl || conjugationDictUrl("es", word),
    glossEn: undefined,
    glossJa: undefined,
    notes,
  };
}

export function normalizeEsPatternCard(item: PatternItem): PatternItem {
  const zh = patternDisplayZh(item, "es");
  return {
    ...item,
    zh: zh ?? item.zh,
  };
}

export function normalizeEsManifestCards(pack: {
  manifest: {
    sourceLang: string;
    vocabulary: VocabularyItem[];
    patterns: PatternItem[];
  };
}): void {
  if (pack.manifest.sourceLang !== "es") return;
  pack.manifest.vocabulary = pack.manifest.vocabulary.map(normalizeEsVocabCard);
  pack.manifest.patterns = pack.manifest.patterns.map(normalizeEsPatternCard);
}
