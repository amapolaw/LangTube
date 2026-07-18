import type { PatternItem, VocabularyItem } from "@langtube/core";
import { frenchDictUrl } from "@/lib/parse-rules";
import { guessFrenchLemma } from "@/lib/french-lemmatize";
import { isBadFrenchGloss, lookupCommonFrenchZh } from "@/lib/french-gloss";
import {
  patternDisplayZh,
  vocabDisplayZh,
} from "@/lib/japanese-card";

function surfaceFromNotes(notes?: string): string | undefined {
  const m = notes?.match(/字幕形[：:]\s*(.+)$/);
  return m?.[1]?.trim();
}

function formatFrZh(zh?: string): string | undefined {
  const t = zh?.trim();
  if (!t) return undefined;
  return t
    .replace(/[；;]+/g, "，")
    .replace(/\s*,\s*/g, "，")
    .replace(/，+/g, "，")
    .replace(/^，|，$/g, "");
}

/** 写入 manifest / 听辨卡片前规范化法语词条（与 petit prince / es-coco 一致） */
export function normalizeFrVocabCard(item: VocabularyItem): VocabularyItem {
  const surface =
    surfaceFromNotes(item.notes) ||
    (item.word.trim().toLowerCase() !==
    (item.lemma?.trim() || item.word).trim().toLowerCase()
      ? item.word.trim()
      : undefined);

  const word = guessFrenchLemma(
    item.lemma?.trim() || surface || item.word
  ).trim();
  const zhRaw = vocabDisplayZh(item, "fr");
  let zh = formatFrZh(zhRaw);
  if (zh && isBadFrenchGloss(word, zh)) {
    zh = formatFrZh(lookupCommonFrenchZh(word)) ?? zh;
  }

  let notes = item.notes?.trim();
  if (surface && surface.toLowerCase() !== word.toLowerCase()) {
    notes = `字幕形：${surface}`;
  } else if (notes?.startsWith("搭配")) {
    /* keep collocation notes */
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
    dictUrl:
      item.dictUrl?.includes("wordreference.com/fren/") ||
      item.dictUrl?.includes("frdic.com")
        ? item.dictUrl
        : frenchDictUrl(word),
    glossEn: undefined,
    glossJa: undefined,
    notes,
  };
}

export function normalizeFrPatternCard(item: PatternItem): PatternItem {
  const zh = patternDisplayZh(item, "fr");
  return {
    ...item,
    zh: zh ?? item.zh,
  };
}

export function normalizeFrManifestCards(pack: {
  manifest: {
    sourceLang: string;
    vocabulary: VocabularyItem[];
    patterns: PatternItem[];
  };
}): void {
  if (pack.manifest.sourceLang !== "fr") return;
  pack.manifest.vocabulary = pack.manifest.vocabulary.map(normalizeFrVocabCard);
  pack.manifest.patterns = pack.manifest.patterns.map(normalizeFrPatternCard);
}
