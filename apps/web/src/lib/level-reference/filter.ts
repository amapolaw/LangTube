import fs from "fs";
import path from "path";
import { getDataDir } from "@/lib/paths";
import {
  isLevelAllowed,
  normalizeLevel,
  referencesForLevel,
} from "@/lib/level-reference/catalog";
import { EN_CEFR_SEED, ES_CEFR_SEED } from "@/lib/level-reference/cefr-seed";
import type { VocabularyItem, PatternItem, SupportedLanguage } from "@langtube/core";

export type JaLexiconEntry = {
  word: string;
  reading?: string;
  pos?: string;
  zh?: string;
  gloss?: string;
  examples?: string[];
  source?: string;
};

export type EnPatternEntry = {
  pattern: string;
  zh: string;
  examples?: string[];
  source?: string;
  levels?: string[];
};

type RefCache = {
  jaLexicon?: Record<string, JaLexiconEntry>;
  jaJlpt?: Record<string, string>;
  enPatterns?: EnPatternEntry[];
  enCefr?: Record<string, string>;
  esCefr?: Record<string, string>;
};

const cache: RefCache = {};

function refDir() {
  return path.join(getDataDir(), "reference");
}

function loadJson<T>(name: string, fallback: T): T {
  const p = path.join(refDir(), name);
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export function getJaLexicon(): Record<string, JaLexiconEntry> {
  if (!cache.jaLexicon) {
    cache.jaLexicon = loadJson("ja-lexicon.json", {});
  }
  return cache.jaLexicon;
}

export function getJaJlptLevels(): Record<string, string> {
  if (!cache.jaJlpt) {
    cache.jaJlpt = loadJson("ja-jlpt-levels.json", {});
  }
  return cache.jaJlpt;
}

export function getEnPatterns(): EnPatternEntry[] {
  if (!cache.enPatterns) {
    cache.enPatterns = loadJson("en-patterns.json", []);
  }
  return cache.enPatterns;
}

export function getEnCefrLevels(): Record<string, string> {
  if (!cache.enCefr) {
    const loaded = loadJson<Record<string, string>>("en-cefr-levels.json", {});
    cache.enCefr = { ...EN_CEFR_SEED, ...loaded };
  }
  return cache.enCefr;
}

export function getEsCefrLevels(): Record<string, string> {
  if (!cache.esCefr) {
    const loaded = loadJson<Record<string, string>>("es-cefr-levels.json", {});
    cache.esCefr = { ...ES_CEFR_SEED, ...loaded };
  }
  return cache.esCefr;
}

function normalizeWord(word: string, lang: string): string {
  const w = word.trim();
  if (lang === "ja") return w;
  return w.toLowerCase();
}

/** 查询词在参考库中的等级 */
export function lookupWordLevel(
  word: string,
  lang: SupportedLanguage | string
): string | undefined {
  const key = normalizeWord(word, lang);
  if (lang === "ja") {
    const map = getJaJlptLevels();
    return map[word] || map[key];
  }
  if (lang === "en") {
    return getEnCefrLevels()[key];
  }
  if (lang === "es") {
    return getEsCefrLevels()[key];
  }
  return undefined;
}

export function lookupJaLexicon(word: string): JaLexiconEntry | undefined {
  const lex = getJaLexicon();
  if (lex[word]) return lex[word];
  // 尝试去掉活用残留
  for (const suffix of ["て", "た", "ない", "ます", "です", "だ"]) {
    if (word.endsWith(suffix) && word.length > suffix.length + 1) {
      const stem = word.slice(0, -suffix.length);
      if (lex[stem]) return lex[stem];
      if (lex[stem + "る"]) return lex[stem + "る"];
    }
  }
  return undefined;
}

export type LevelFilterResult = {
  vocabulary: VocabularyItem[];
  patterns: PatternItem[];
  droppedVocab: number;
  keptVocab: number;
  references: string[];
  targetLevel: string;
};

/**
 * 按素材所选等级，对照参考词库甄别词汇/句型。
 * 保留：等级 ≤ 目标，或能在用户 Language 词库中命中且目标≥N3/B1 的词。
 */
export function filterPackByLevel(
  vocabulary: VocabularyItem[],
  patterns: PatternItem[],
  lang: SupportedLanguage | string,
  targetLevel: string
): LevelFilterResult {
  const target = normalizeLevel(targetLevel, lang);
  const refs = referencesForLevel(lang, target).map((r) => r.label);

  const kept: VocabularyItem[] = [];
  let dropped = 0;

  for (const item of vocabulary) {
    const fromLlm = item.level;
    const fromRef = lookupWordLevel(item.word, lang);
    const level = fromLlm || fromRef;

    let allow = false;
    if (level) {
      allow = isLevelAllowed(level, target, lang);
    } else if (lang === "ja") {
      // 无 JLPT 标签：若在用户权威词库中，且目标 ≥ N3，则保留（红蓝宝书/词汇大全覆盖面）
      const lex = lookupJaLexicon(item.word);
      if (lex) {
        allow =
          levelRankSafe(target, lang) >= levelRankSafe("N3", lang) ||
          item.sentenceIds.length >= 2;
      }
    } else {
      // 英/西：无等级时，短高频词倾向保留
      allow = item.word.length <= 6 && item.sentenceIds.length >= 2;
    }

    if (allow) {
      const lex = lang === "ja" ? lookupJaLexicon(item.word) : undefined;
      kept.push({
        ...item,
        level: level || item.level,
        zh: item.zh || lex?.zh || "",
        reading: item.reading || lex?.reading,
        partOfSpeech: item.partOfSpeech || lex?.pos,
      });
    } else {
      dropped += 1;
    }
  }

  // 句型：日语保留较短实用句；英语匹配「英文常用句型」
  let keptPatterns = patterns;
  if (lang === "en") {
    const catalog = getEnPatterns();
    const matched: PatternItem[] = [];
    for (const p of patterns) {
      const hit = catalog.find((c) =>
        p.pattern.toLowerCase().includes(
          c.pattern.toLowerCase().replace(/\.+$/, "").slice(0, 24)
        )
      );
      if (hit && (!hit.levels || hit.levels.includes(target) || levelRankSafe(target, "en") >= 1)) {
        matched.push({
          ...p,
          zh: p.zh || hit.zh,
          grammar: hit.pattern,
          examples: hit.examples?.length ? hit.examples : p.examples,
        });
      }
    }
    // 若几乎无匹配，保留较短句型（≤ 12 词）作为该等级练习句
    keptPatterns =
      matched.length > 0
        ? matched.slice(0, 40)
        : patterns
            .filter((p) => p.pattern.split(/\s+/).length <= 14)
            .slice(0, 30);
  } else if (lang === "ja") {
    keptPatterns = patterns
      .filter((p) => {
        const len = p.pattern.replace(/\s/g, "").length;
        return len >= 4 && len <= 40;
      })
      .slice(0, 40);
  } else {
    keptPatterns = patterns
      .filter((p) => p.pattern.split(/\s+/).length <= 16)
      .slice(0, 40);
  }

  return {
    vocabulary: kept,
    patterns: keptPatterns,
    droppedVocab: dropped,
    keptVocab: kept.length,
    references: refs,
    targetLevel: target,
  };
}

function levelRankSafe(level: string, lang: string): number {
  const order =
    lang === "ja"
      ? ["N5", "N4", "N3", "N2", "N1"]
      : ["A1", "A2", "B1", "B2", "C1", "C2"];
  const n = normalizeLevel(level, lang);
  const i = order.indexOf(n);
  return i < 0 ? 2 : i;
}
