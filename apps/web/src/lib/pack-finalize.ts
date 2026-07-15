import type {
  ContentPack,
  PatternItem,
  SupportedLanguage,
  VocabularyItem,
} from "@langtube/core";
import {
  filterPackByLevel,
  lookupJaLexicon,
} from "@/lib/level-reference/filter";
import { isBasicSkipWord } from "@/lib/vocab-extract";
import { isCompleteLearningSentence } from "@/lib/transcript-noise-filter";

function normalizeWordKey(word: string, lang: SupportedLanguage): string {
  const w = word.trim();
  if (lang === "ja") return w;
  return w.toLowerCase();
}

function mergeZhMeanings(a?: string, b?: string): string {
  const parts = new Set<string>();
  for (const raw of [a, b]) {
    if (!raw?.trim()) continue;
    for (const piece of raw.split(/[；;、\n]+/)) {
      const t = piece.trim();
      if (t) parts.add(t);
    }
  }
  return Array.from(parts).join("；");
}

/** 词汇去重，合并全部中文释义 */
export function dedupeVocabularyForManifest(
  items: VocabularyItem[],
  lang: SupportedLanguage
): VocabularyItem[] {
  const map = new Map<string, VocabularyItem>();
  for (const item of items) {
    const key = normalizeWordKey(item.word, lang);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item, word: item.word.trim() });
      continue;
    }
    existing.sentenceIds = [
      ...new Set([...existing.sentenceIds, ...item.sentenceIds]),
    ];
    existing.zh = mergeZhMeanings(existing.zh, item.zh);
    if (!existing.reading && item.reading) existing.reading = item.reading;
    if (!existing.partOfSpeech && item.partOfSpeech) {
      existing.partOfSpeech = item.partOfSpeech;
    }
    if (!existing.level && item.level) existing.level = item.level;
    if (!existing.glossEn && item.glossEn) existing.glossEn = item.glossEn;
    if (!existing.glossJa && item.glossJa) existing.glossJa = item.glossJa;
    if (!existing.lemma && item.lemma) existing.lemma = item.lemma;
    if (!existing.dictUrl && item.dictUrl) existing.dictUrl = item.dictUrl;
    if (!existing.etymology && item.etymology) existing.etymology = item.etymology;
    if (!existing.notes && item.notes) existing.notes = item.notes;
    if (item.isAcronym) existing.isAcronym = true;
    if (item.isLoanword) existing.isLoanword = true;
  }
  return Array.from(map.values()).map((v, i) => ({
    ...v,
    id: `vocab-${i + 1}`,
  }));
}

function grammarKey(grammar: string): string {
  return grammar.replace(/\s+/g, " ").trim().toLowerCase();
}

/** 句型按语法讲解去重，保留首条代表句 */
export function dedupePatternsByGrammar(
  patterns: PatternItem[]
): PatternItem[] {
  const seenGrammar = new Set<string>();
  const seenSentence = new Set<string>();
  const out: PatternItem[] = [];

  for (const p of patterns) {
    const sentenceKey = p.pattern.replace(/\s+/g, " ").trim();
    if (!sentenceKey) continue;
    if (seenSentence.has(sentenceKey)) continue;

    const g = p.grammar?.trim();
    const gKey = g && g !== "句型" ? grammarKey(g) : `__sentence__:${sentenceKey}`;

    if (seenGrammar.has(gKey)) continue;
    seenGrammar.add(gKey);
    seenSentence.add(sentenceKey);
    out.push(p);
  }

  return out.map((p, i) => ({ ...p, id: `pattern-${i + 1}` }));
}

/**
 * 按素材语言等级甄别词汇/句型，去重后写回 manifest（听辨页展示用）。
 */
export function finalizeManifestForListen(pack: ContentPack): {
  vocabCount: number;
  patternCount: number;
  targetLevel: string;
} {
  const lang = pack.manifest.sourceLang;
  const level =
    pack.manifest.level || (lang === "ja" ? "N3" : lang === "en" ? "A2" : "B1");

  const filtered = filterPackByLevel(
    pack.manifest.vocabulary,
    pack.manifest.patterns,
    lang,
    level
  );

  let vocabulary = dedupeVocabularyForManifest(filtered.vocabulary, lang);
  vocabulary = vocabulary.filter((v) => !isBasicSkipWord(v.word, lang));
  if (lang === "ja") {
    vocabulary = vocabulary.map((v) => {
      const lex = lookupJaLexicon(v.word);
      if (!lex) return v;
      return {
        ...v,
        zh: mergeZhMeanings(v.zh, lex.zh || lex.gloss),
        reading: v.reading || lex.reading,
        partOfSpeech: v.partOfSpeech || lex.pos,
      };
    });
  }

  const patterns = dedupePatternsByGrammar(
    filtered.patterns.filter((p) => isCompleteLearningSentence(p.pattern, lang))
  );

  pack.manifest.vocabulary = vocabulary;
  pack.manifest.patterns = patterns;
  pack.manifest.updatedAt = new Date().toISOString();

  const refTag = `level:${filtered.targetLevel}`;
  if (!pack.manifest.topics.includes(refTag)) {
    pack.manifest.topics = [...pack.manifest.topics, refTag];
  }

  return {
    vocabCount: vocabulary.length,
    patternCount: patterns.length,
    targetLevel: filtered.targetLevel,
  };
}
