import type {
  ContentPack,
  PatternItem,
  SupportedLanguage,
  VocabularyItem,
} from "@langtube/core";
import { lookupDictionary } from "@/lib/dictionary/lookup";
import { dedupeVocabularyForManifest } from "@/lib/pack-finalize";
import {
  guessLemmaKey,
  vocabKey,
} from "@/lib/lemma-keys";
import { resolveLemma } from "@/lib/lemma-resolve";
import { translateToZh, translateEsWordToZh, translateFrWordToZh } from "@/lib/translate-zh";
import { chatCompletion, getLlmConfig } from "@/lib/llm/client";
import { tokenizeJapaneseForSelection, tokenizeJapaneseWords } from "@/lib/japanese-tokenize";
import { isLikelyWordNotPhrase } from "@/lib/vocab-extract";
import {
  collectKnownGrammarKeys,
  composeGrammarText,
  isGenericGrammar,
  sanitizeStoredGrammar,
  type GrammarParts,
} from "@/lib/pattern-grammar";
import {
  inferJapaneseGrammar,
  isSourceLanguageText,
  mergeGrammarParts,
} from "@/lib/japanese-pattern-grammar";
import {
  normalizeJaPatternCard,
  normalizeJaVocabCard,
} from "@/lib/japanese-card";
import {
  normalizeEsPatternCard,
  normalizeEsVocabCard,
} from "@/lib/spanish-card";
import {
  normalizeFrPatternCard,
  normalizeFrVocabCard,
} from "@/lib/french-card";
import { isBadFrenchGloss, lookupCommonFrenchZh } from "@/lib/french-gloss";

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/** 确保词汇/句型释义为中文，不回落到原文或英文 */
async function ensureChineseGloss(
  text: string,
  lang: SupportedLanguage,
  current?: string,
  contextLine?: string
): Promise<string> {
  let zh = current?.trim() || "";
  if (
    zh &&
    hasChinese(zh) &&
    !isSourceLanguageText(zh, lang) &&
    !(lang === "fr" && isBadFrenchGloss(text, zh))
  ) {
    return zh;
  }

  if (lang === "es") {
    const es = await translateEsWordToZh(text);
    if (es && hasChinese(es)) return es;
  } else if (lang === "fr") {
    const fr =
      lookupCommonFrenchZh(text, contextLine) ??
      (await translateFrWordToZh(text, undefined, contextLine));
    if (fr && hasChinese(fr)) return fr;
  }

  const translated = await translateToZh(text, lang);
  if (translated && hasChinese(translated) && !isSourceLanguageText(translated, lang)) {
    if (lang === "fr" && isBadFrenchGloss(text, translated)) {
      return lookupCommonFrenchZh(text, contextLine) ?? "（暂无中文释义）";
    }
    return translated;
  }

  return lookupCommonFrenchZh(text, contextLine) ?? "（暂无中文释义）";
}

function nextVocabId(existing: VocabularyItem[]): string {
  let max = 0;
  for (const v of existing) {
    const m = /^vocab-(\d+)$/.exec(v.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `vocab-${max + 1}`;
}

function nextPatternId(existing: PatternItem[]): string {
  let max = 0;
  for (const p of existing) {
    const m = /^pattern-(\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `pattern-${max + 1}`;
}

function contextLineFromPack(
  pack: ContentPack,
  lineIds?: string[],
  fallbackLineIds?: string[]
): string | undefined {
  const ids = lineIds?.length ? lineIds : fallbackLineIds;
  if (!ids?.length) return undefined;
  const line = pack.transcript.lines.find((l) => ids.includes(l.id));
  return line?.text?.trim() || undefined;
}

async function glossLemma(
  lemma: string,
  lang: SupportedLanguage,
  surface?: string,
  contextLine?: string
): Promise<{
  zh: string;
  reading?: string;
  partOfSpeech?: string;
  glossEn?: string;
  dictUrl?: string;
  notes?: string;
  lemma?: string;
}> {
  const resolved = await resolveLemma(surface || lemma, lang);
  const head = resolved.lemma || lemma;
  const hit = await lookupDictionary(head, lang);
  let zh = "";
  let reading = resolved.reading || hit?.reading;
  let partOfSpeech =
    resolved.partOfSpeech || hit?.senses?.[0]?.partOfSpeech?.join(", ");
  let dictUrl = resolved.dictUrl;
  let notes: string | undefined;

  if (surface && surface.trim() !== head.trim()) {
    notes = `字幕形：${surface.trim()}`;
  }

  if (hit) {
    const enGlosses =
      hit.senses?.flatMap((s) => s.glossEn ?? []).filter(Boolean) ?? [];
    const zhCandidate = enGlosses.find((g) => hasChinese(g));
    if (zhCandidate) zh = zhCandidate;
    if (!zh && enGlosses.length) {
      const fromEn = await translateToZh(enGlosses.slice(0, 3).join("; "), "en");
      if (fromEn && hasChinese(fromEn)) zh = fromEn;
    }
  }

  if (!zh || !hasChinese(zh) || (lang === "fr" && isBadFrenchGloss(head, zh))) {
    const translated =
      lang === "es"
        ? await translateEsWordToZh(head, surface)
        : lang === "fr"
          ? await translateFrWordToZh(head, surface, contextLine)
          : await translateToZh(head, lang);
    if (translated && hasChinese(translated)) zh = translated;
  }

  if ((!zh || !hasChinese(zh) || isSourceLanguageText(zh, lang)) && (await getLlmConfig())) {
    try {
      const raw = await chatCompletion(
        '你是语言学习助手。只返回 JSON：{"zh":"中文释义","notes":"可选用法一句"}',
        JSON.stringify({ word: head, surface, lang })
      );
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { zh?: string; notes?: string };
        if (parsed.zh && hasChinese(parsed.zh) && !isSourceLanguageText(parsed.zh, lang)) {
          zh = parsed.zh.trim();
        }
        if (parsed.notes) {
          notes = notes
            ? `${notes}；${parsed.notes.trim()}`
            : parsed.notes.trim();
        }
      }
    } catch {
      /* ignore */
    }
  }

  zh = await ensureChineseGloss(head, lang, zh, contextLine);

  return {
    zh,
    reading,
    partOfSpeech,
    dictUrl,
    notes,
    lemma: head,
  };
}

type CollocationNote = { phrase: string; usage: string };

async function glossPattern(
  text: string,
  lang: SupportedLanguage,
  translationHint?: string,
  knownKeys: Set<string> = new Set()
): Promise<{ zh: string; grammar: string }> {
  let llmZh = "";
  let parts: GrammarParts = {
    points: [],
    collocations: [],
    idioms: [],
  };

  if (lang === "ja") {
    parts = mergeGrammarParts(parts, inferJapaneseGrammar(text));
  }

  if (await getLlmConfig()) {
    try {
      const raw = await chatCompletion(
        [
          "你是日语/语言教师。用中文回答。",
          "只识别句中【具体】语法点、固定搭配、俚语/习惯用法。",
          "禁止输出笼统套话（如「关注主谓结构、时态与关键搭配」「关注句尾谓语与助词搭配」）。",
          "若本句没有值得讲解的具体点，grammar/points/collocations/idioms 全部留空。",
          "已在 earlierPoints 中出现过的相同语法点/搭配/俚语不要重复输出。",
          '只返回 JSON：{"zh":"整句的中文翻译","points":["具体语法点（中文）"],"collocations":[{"phrase":"原文搭配","usage":"中文用法说明"}],"idioms":[{"phrase":"原文","usage":"中文说明"}]}',
        ].join("\n"),
        JSON.stringify({
          text,
          lang,
          hint:
            translationHint && hasChinese(translationHint) && !isSourceLanguageText(translationHint, lang)
              ? translationHint
              : "",
          earlierPoints: [...knownKeys].slice(0, 40),
        })
      );
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as {
          zh?: string;
          points?: string[];
          grammar?: string;
          collocations?: CollocationNote[];
          idioms?: CollocationNote[];
        };
        if (parsed.zh && hasChinese(parsed.zh) && !isSourceLanguageText(parsed.zh, lang)) {
          llmZh = parsed.zh.trim();
        }
        if (Array.isArray(parsed.points)) {
          parts = mergeGrammarParts(parts, {
            points: parsed.points
              .map((p) => (typeof p === "string" ? p.trim() : ""))
              .filter(Boolean),
            collocations: [],
            idioms: [],
          });
        } else if (parsed.grammar?.trim() && !isGenericGrammar(parsed.grammar)) {
          parts = mergeGrammarParts(parts, {
            points: [parsed.grammar.trim()],
            collocations: [],
            idioms: [],
          });
        }
        if (Array.isArray(parsed.collocations)) {
          parts = mergeGrammarParts(parts, {
            points: [],
            collocations: parsed.collocations.filter(
              (c) => c?.phrase?.trim() && c?.usage?.trim()
            ),
            idioms: [],
          });
        }
        if (Array.isArray(parsed.idioms)) {
          parts = mergeGrammarParts(parts, {
            points: [],
            collocations: [],
            idioms: parsed.idioms.filter(
              (c) => c?.phrase?.trim() && c?.usage?.trim()
            ),
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  const grammar = composeGrammarText(parts, knownKeys);
  const hintOk =
    translationHint &&
    hasChinese(translationHint) &&
    !isSourceLanguageText(translationHint, lang)
      ? translationHint.trim()
      : "";
  let zhCandidate = llmZh || hintOk;
  if (zhCandidate && isSourceLanguageText(zhCandidate, lang)) {
    zhCandidate = "";
  }
  const zh = await ensureChineseGloss(text, lang, zhCandidate);

  return { zh, grammar };
}

function transcriptTranslationHint(
  pack: ContentPack,
  text: string,
  lang: SupportedLanguage
): string | undefined {
  const norm = text.replace(/\s+/g, " ").trim();
  if (!norm) return undefined;
  for (const line of pack.transcript.lines) {
    const lt = line.text.replace(/\s+/g, " ").trim();
    if (lt === norm || lt.includes(norm) || norm.includes(lt)) {
      const tr = line.translation?.trim();
      if (tr && hasChinese(tr) && !isSourceLanguageText(tr, lang)) {
        return tr;
      }
    }
  }
  return undefined;
}

export type ParseSelectionVocabResult = {
  added: VocabularyItem[];
  updated: VocabularyItem[];
  vocabulary: VocabularyItem[];
  message: string;
  skipped?: string[];
};

export type ParseSelectionPatternResult = {
  added: PatternItem[];
  updated: PatternItem[];
  patterns: PatternItem[];
  message: string;
};

function finalizeLearningCardsInPack(pack: ContentPack, lang: SupportedLanguage) {
  if (lang === "ja") {
    pack.manifest.vocabulary = pack.manifest.vocabulary.map(normalizeJaVocabCard);
    pack.manifest.patterns = pack.manifest.patterns.map(normalizeJaPatternCard);
  } else if (lang === "es") {
    pack.manifest.vocabulary = pack.manifest.vocabulary.map(normalizeEsVocabCard);
    pack.manifest.patterns = pack.manifest.patterns.map(normalizeEsPatternCard);
  } else if (lang === "fr") {
    pack.manifest.vocabulary = pack.manifest.vocabulary.map(normalizeFrVocabCard);
    pack.manifest.patterns = pack.manifest.patterns.map(normalizeFrPatternCard);
  }
}

function existingVocabKeys(
  items: VocabularyItem[],
  lang: SupportedLanguage
): Set<string> {
  const keys = new Set<string>();
  for (const v of items) {
    for (const k of [
      vocabKey(v.word, lang),
      v.lemma ? vocabKey(v.lemma, lang) : "",
      guessLemmaKey(v.word, lang),
    ]) {
      if (k) keys.add(k);
    }
  }
  return keys;
}

const JA_SKIP_VOCAB = new Set([
  "られる",
  "れる",
  "いる",
  "ある",
  "する",
  "なる",
  "おる",
  "ない",
  "ん",
  "の",
  "か",
  "かな",
]);

function shouldSkipJapaneseVocabLemma(lemma: string, surface: string): boolean {
  const l = lemma.trim();
  const s = surface.trim();
  if (!l || l.length < 2) return true;
  if (JA_SKIP_VOCAB.has(l) || JA_SKIP_VOCAB.has(s)) return true;
  if (/^(?:られん|れん|ちゃん)$/.test(s)) return true;
  return false;
}

function pushJaWordToken(
  out: { surface: string; lemma: string }[],
  seen: Set<string>,
  surface: string,
  lemma: string,
  lang: SupportedLanguage
) {
  const head = lemma.trim() || surface.trim();
  const surf = surface.trim();
  if (!head || shouldSkipJapaneseVocabLemma(head, surf)) return;
  const key = vocabKey(head, lang);
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ surface: surf, lemma: head });
}

/** 日语：若误选整句/半句，拆成单语后再解析 */
async function expandJapaneseWordSelections(
  words: string[],
  lang: SupportedLanguage
): Promise<{ surface: string; lemma: string }[]> {
  if (lang !== "ja") {
    return words.map((surface) => ({
      surface,
      lemma: guessLemmaKey(surface, lang),
    }));
  }

  const out: { surface: string; lemma: string }[] = [];
  const seen = new Set<string>();

  for (const raw of words) {
    const surface = raw.trim();
    if (!surface) continue;

    const phraseLike = !isLikelyWordNotPhrase(surface, lang);

    if (phraseLike) {
      const contentWords = await tokenizeJapaneseWords(surface);
      if (contentWords.length > 1) {
        for (const w of contentWords) {
          pushJaWordToken(out, seen, w.word, w.word, lang);
        }
        continue;
      }

      const tokens = await tokenizeJapaneseForSelection(surface);
      const selectable = tokens.filter(
        (t) => t.selectable && !shouldSkipJapaneseVocabLemma(t.lemma, t.surface)
      );
      if (selectable.length > 1) {
        for (const t of selectable) {
          pushJaWordToken(out, seen, t.surface, t.lemma, lang);
        }
        continue;
      }
    }

    if (isLikelyWordNotPhrase(surface, lang)) {
      const key = vocabKey(surface, lang);
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ surface, lemma: surface });
      }
      continue;
    }

    const tokens = await tokenizeJapaneseForSelection(surface);
    const selectable = tokens.filter(
      (t) => t.selectable && !shouldSkipJapaneseVocabLemma(t.lemma, t.surface)
    );
    if (selectable.length === 0) {
      const key = vocabKey(surface, lang);
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ surface, lemma: surface });
      }
      continue;
    }

    for (const t of selectable) {
      pushJaWordToken(out, seen, t.surface, t.lemma, lang);
    }
  }

  return out;
}

/** 按用户点选的单词解析并写入词汇表（字典型展示，追加、去重；支持重新解析已有条目） */
export async function parseSelectedVocabulary(
  pack: ContentPack,
  opts: {
    words?: string[];
    lineIds?: string[];
    vocabIds?: string[];
    reparse?: boolean;
  }
): Promise<ParseSelectionVocabResult> {
  const lang = pack.manifest.sourceLang as SupportedLanguage;
  let list = [...pack.manifest.vocabulary];
  const added: VocabularyItem[] = [];
  const updated: VocabularyItem[] = [];

  if (opts.reparse && opts.vocabIds?.length) {
    const removeIds = new Set<string>();
    const splitTargets: {
      surface: string;
      lemma: string;
      lineIds: string[];
      phraseContext?: string;
    }[] = [];
    let existingKeys = existingVocabKeys(list, lang);

    for (const vid of opts.vocabIds) {
      const item = list.find((v) => v.id === vid);
      if (!item) continue;
      const surface =
        item.notes?.match(/字幕形[：:]\s*(.+)$/)?.[1]?.trim() || item.word;

      if (lang === "ja" && !isLikelyWordNotPhrase(surface, lang)) {
        removeIds.add(vid);
        const expanded = await expandJapaneseWordSelections([surface], lang);
        for (const t of expanded) {
          splitTargets.push({
            surface: t.surface,
            lemma: t.lemma,
            lineIds: item.sentenceIds ?? [],
            phraseContext: surface,
          });
        }
        continue;
      }

      const contextLine = contextLineFromPack(pack, undefined, item.sentenceIds);
      const gloss = await glossLemma(
        item.lemma || item.word,
        lang,
        surface,
        contextLine
      );
      const headword = gloss.lemma || item.lemma || item.word;
      item.word = headword;
      item.lemma = headword;
      item.zh = gloss.zh;
      item.reading = gloss.reading;
      item.partOfSpeech = gloss.partOfSpeech;
      item.glossEn = undefined;
      item.dictUrl = gloss.dictUrl;
      item.notes = gloss.notes;
      updated.push(item);
    }

    if (removeIds.size) {
      list = list.filter((v) => !removeIds.has(v.id));
      existingKeys = existingVocabKeys(list, lang);
      for (const t of splitTargets) {
        const contextLine = contextLineFromPack(pack, undefined, t.lineIds);
        const gloss = await glossLemma(t.lemma, lang, t.surface, contextLine);
        const headword = gloss.lemma || t.lemma;
        const key = vocabKey(headword, lang);
        if (existingKeys.has(key)) continue;
        const item: VocabularyItem = {
          id: nextVocabId(list),
          word: headword,
          lemma: headword,
          zh: gloss.zh,
          reading: gloss.reading,
          partOfSpeech: gloss.partOfSpeech,
          dictUrl: gloss.dictUrl,
          notes:
            gloss.notes ||
            (t.phraseContext && t.phraseContext !== headword
              ? `出自短语：${t.phraseContext}`
              : undefined),
          sentenceIds: t.lineIds.slice(0, 8),
        };
        list.push(item);
        existingKeys.add(key);
        added.push(item);
      }
    }

    list = dedupeVocabularyForManifest(list, lang);
    pack.manifest.vocabulary = list;
    finalizeLearningCardsInPack(pack, lang);
    pack.manifest.updatedAt = new Date().toISOString();

    let message = "";
    if (added.length && updated.length) {
      message = `已拆分/重新解析：新增 ${added.length} 个词，更新 ${updated.length} 个词`;
    } else if (added.length) {
      message = `已将短语拆分为 ${added.length} 个词并写入词汇表`;
    } else if (updated.length) {
      message = `已重新解析 ${updated.length} 个词`;
    } else {
      message = "未找到可重新解析的词汇";
    }

    return { added, updated, vocabulary: list, message };
  }

  const words = opts.words ?? [];
  const lineIds = opts.lineIds ?? [];
  const cleaned = [
    ...new Set(
      words
        .map((w) => w.trim())
        .filter((w) => w.length > 0 && w.length < 80)
    ),
  ];
  if (!cleaned.length) {
    return {
      added: [],
      updated: [],
      vocabulary: pack.manifest.vocabulary,
      message: "未选择有效单词",
    };
  }

  const expanded = await expandJapaneseWordSelections(cleaned, lang);
  if (!expanded.length) {
    return {
      added: [],
      updated: [],
      vocabulary: pack.manifest.vocabulary,
      message: "未选择有效单词",
    };
  }

  const existingKeys = existingVocabKeys(pack.manifest.vocabulary, lang);
  const skipped: string[] = [];
  const selectionContext = contextLineFromPack(pack, lineIds);

  for (const { surface, lemma: lemmaHint } of expanded) {
    const gloss = await glossLemma(
      lemmaHint,
      lang,
      surface,
      selectionContext
    );
    const headword = gloss.lemma || lemmaHint;
    const key = vocabKey(headword, lang);
    if (existingKeys.has(key)) {
      skipped.push(surface);
      continue;
    }
    const item: VocabularyItem = {
      id: nextVocabId(list),
      word: headword,
      lemma: headword,
      zh: gloss.zh,
      reading: gloss.reading,
      partOfSpeech: gloss.partOfSpeech,
      dictUrl: gloss.dictUrl,
      notes: gloss.notes,
      sentenceIds: lineIds.slice(0, 8),
    };
    list.push(item);
    existingKeys.add(vocabKey(headword, lang));
    added.push(item);
  }

  list = dedupeVocabularyForManifest(list, lang);
  pack.manifest.vocabulary = list;
  finalizeLearningCardsInPack(pack, lang);
  pack.manifest.updatedAt = new Date().toISOString();

  let message = "";
  if (added.length > 0) {
    message = `已解析 ${added.length} 个词（字典型）并加入词汇表`;
  } else if (skipped.length > 0) {
    message = "所选词已在词汇表中（已解析展示）";
  } else {
    message = "未添加新词";
  }

  return { added, updated: [], vocabulary: list, message, skipped };
}

function patternTextKey(text: string, lang: SupportedLanguage): string {
  const t = text.trim();
  return lang === "ja" ? t : t.toLowerCase();
}

/** 按用户多选字幕行解析句型（可合并；支持重新解析已有条目） */
export async function parseSelectedPatterns(
  pack: ContentPack,
  opts: {
    lineIds?: string[];
    patternIds?: string[];
    merge?: boolean;
    reparse?: boolean;
  }
): Promise<ParseSelectionPatternResult> {
  const lang = pack.manifest.sourceLang as SupportedLanguage;
  const list = [...pack.manifest.patterns];
  const added: PatternItem[] = [];
  const updated: PatternItem[] = [];

  if (opts.reparse && opts.patternIds?.length) {
    const exclude = new Set(opts.patternIds);
    const knownKeys = collectKnownGrammarKeys(
      list,
      exclude,
      (p) => (p as PatternItem).id
    );
    for (const pid of opts.patternIds) {
      const item = list.find((p) => p.id === pid);
      if (!item) continue;
      const hint =
        transcriptTranslationHint(pack, item.pattern, lang) ||
        (item.zh && !isSourceLanguageText(item.zh, lang) ? item.zh : undefined);
      const gloss = await glossPattern(item.pattern, lang, hint, knownKeys);
      item.zh = gloss.zh;
      item.grammar = sanitizeStoredGrammar(gloss.grammar);
      updated.push(item);
    }
    pack.manifest.patterns = list;
    finalizeLearningCardsInPack(pack, lang);
    pack.manifest.updatedAt = new Date().toISOString();
    return {
      added: [],
      updated,
      patterns: list,
      message:
        updated.length > 0
          ? `已重新解析 ${updated.length} 条句型`
          : "未找到可重新解析的句型",
    };
  }

  const lineIds = opts.lineIds ?? [];
  const idSet = new Set(lineIds);
  const lines = pack.transcript.lines.filter((l) => idSet.has(l.id));
  if (!lines.length) {
    return {
      added: [],
      updated: [],
      patterns: pack.manifest.patterns,
      message: "未找到选中的字幕行",
    };
  }

  const merge = opts.merge !== false && lines.length > 1;
  const units: { text: string; zhHint?: string; lineIds: string[] }[] = merge
    ? [
        {
          text: lines
            .map((l) => l.text.trim())
            .filter(Boolean)
            .join(lang === "ja" ? "" : " "),
          zhHint: lines
            .map((l) => l.translation?.trim())
            .filter(Boolean)
            .join(" "),
          lineIds: lines.map((l) => l.id),
        },
      ]
    : lines.map((l) => ({
        text: l.text.trim(),
        zhHint: l.translation?.trim(),
        lineIds: [l.id],
      }));

  const byTextKey = new Map(
    list.map((p) => [patternTextKey(p.pattern, lang), p])
  );
  const knownKeys = collectKnownGrammarKeys(list, undefined, (p) =>
    (p as PatternItem).id
  );

  for (const unit of units) {
    if (!unit.text) continue;
    const key = patternTextKey(unit.text, lang);
    const existing = byTextKey.get(key);
    if (existing) {
      if (opts.reparse) {
        const gloss = await glossPattern(
          unit.text,
          lang,
          unit.zhHint,
          knownKeys
        );
        existing.zh = gloss.zh;
        existing.grammar = sanitizeStoredGrammar(gloss.grammar);
        updated.push(existing);
      }
      continue;
    }
    const gloss = await glossPattern(unit.text, lang, unit.zhHint, knownKeys);
    const item: PatternItem = {
      id: nextPatternId(list),
      pattern: unit.text,
      zh: gloss.zh,
      grammar: sanitizeStoredGrammar(gloss.grammar),
      examples: [],
    };
    list.push(item);
    byTextKey.set(key, item);
    added.push(item);
  }

  pack.manifest.patterns = list;
  finalizeLearningCardsInPack(pack, lang);
  pack.manifest.updatedAt = new Date().toISOString();

  let message = "";
  if (added.length > 0 && updated.length > 0) {
    message = `新增 ${added.length} 条、更新 ${updated.length} 条句型`;
  } else if (added.length > 0) {
    message = `已解析 ${added.length} 条句型并加入「句型 / 语法」`;
  } else if (updated.length > 0) {
    message = `已重新解析 ${updated.length} 条句型`;
  } else {
    message = "所选内容已在句型表中（未开启重新解析）";
  }

  return { added, updated, patterns: list, message };
}
