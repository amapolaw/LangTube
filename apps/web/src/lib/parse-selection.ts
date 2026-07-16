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
import { translateToZh } from "@/lib/translate-zh";
import { chatCompletion, getLlmConfig } from "@/lib/llm/client";
import {
  collectKnownGrammarKeys,
  composeGrammarText,
  isGenericGrammar,
  sanitizeStoredGrammar,
  type GrammarParts,
} from "@/lib/pattern-grammar";

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
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

async function glossLemma(
  lemma: string,
  lang: SupportedLanguage,
  surface?: string
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
  let glossEn = resolved.glossEn || "";
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
    if (!glossEn) glossEn = enGlosses.slice(0, 4).join("; ");
    const zhCandidate = enGlosses.find((g) => hasChinese(g));
    if (zhCandidate) zh = zhCandidate;
  }

  if (!zh || !hasChinese(zh)) {
    const translated = await translateToZh(head, lang);
    if (translated && hasChinese(translated)) zh = translated;
  }

  if ((!zh || !hasChinese(zh)) && (await getLlmConfig())) {
    try {
      const raw = await chatCompletion(
        '你是语言学习助手。只返回 JSON：{"zh":"中文释义","notes":"可选用法一句"}',
        JSON.stringify({ word: head, surface, lang })
      );
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { zh?: string; notes?: string };
        if (parsed.zh && hasChinese(parsed.zh)) zh = parsed.zh.trim();
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

  return {
    zh: zh || glossEn || head,
    reading,
    partOfSpeech,
    glossEn: glossEn || undefined,
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
  let zh = translationHint?.trim() || "";
  if (!zh || !hasChinese(zh)) {
    const translated = await translateToZh(text, lang);
    if (translated && hasChinese(translated)) zh = translated;
  }

  const parts: GrammarParts = {
    points: [],
    collocations: [],
    idioms: [],
  };

  if (await getLlmConfig()) {
    try {
      const raw = await chatCompletion(
        [
          "你是语言教师。只识别句中【具体】语法点、固定搭配、俚语/习惯用法。",
          "禁止输出笼统套话（如「关注主谓结构、时态与关键搭配」「关注句尾谓语与助词搭配」）。",
          "若本句没有值得讲解的具体点，grammar/points/collocations/idioms 全部留空。",
          "已在 earlierPoints 中出现过的相同语法点/搭配/俚语不要重复输出。",
          '只返回 JSON：{"zh":"中文意思","points":["具体语法点一句"],"collocations":[{"phrase":"固定搭配","usage":"用法含义"}],"idioms":[{"phrase":"俚语或习惯用法","usage":"用法含义"}]}',
        ].join("\n"),
        JSON.stringify({
          text,
          lang,
          hint: translationHint || "",
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
        if (parsed.zh && hasChinese(parsed.zh)) zh = parsed.zh.trim();
        if (Array.isArray(parsed.points)) {
          parts.points = parsed.points
            .map((p) => (typeof p === "string" ? p.trim() : ""))
            .filter(Boolean);
        } else if (parsed.grammar?.trim() && !isGenericGrammar(parsed.grammar)) {
          // 兼容旧字段：整段 grammar 当作一条要点
          parts.points = [parsed.grammar.trim()];
        }
        if (Array.isArray(parsed.collocations)) {
          parts.collocations = parsed.collocations.filter(
            (c) => c?.phrase?.trim() && c?.usage?.trim()
          );
        }
        if (Array.isArray(parsed.idioms)) {
          parts.idioms = parsed.idioms.filter(
            (c) => c?.phrase?.trim() && c?.usage?.trim()
          );
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 无 LLM 时不写笼统占位；仅保留空讲解
  const grammar = composeGrammarText(parts, knownKeys);
  if (!zh) zh = translationHint?.trim() || text;

  return { zh, grammar };
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
    for (const vid of opts.vocabIds) {
      const item = list.find((v) => v.id === vid);
      if (!item) continue;
      const surface =
        item.notes?.match(/字幕形[：:]\s*(.+)$/)?.[1]?.trim() || item.word;
      const gloss = await glossLemma(item.lemma || item.word, lang, surface);
      const headword = gloss.lemma || item.lemma || item.word;
      item.word = headword;
      item.lemma = headword;
      item.zh = gloss.zh;
      item.reading = gloss.reading;
      item.partOfSpeech = gloss.partOfSpeech;
      item.glossEn = gloss.glossEn;
      item.dictUrl = gloss.dictUrl;
      item.notes = gloss.notes;
      updated.push(item);
    }
    list = dedupeVocabularyForManifest(list, lang);
    pack.manifest.vocabulary = list;
    pack.manifest.updatedAt = new Date().toISOString();
    return {
      added: [],
      updated,
      vocabulary: list,
      message:
        updated.length > 0
          ? `已重新解析 ${updated.length} 个词`
          : "未找到可重新解析的词汇",
    };
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

  const existingKeys = existingVocabKeys(pack.manifest.vocabulary, lang);
  const skipped: string[] = [];

  for (const surface of cleaned) {
    const lemmaKey = guessLemmaKey(surface, lang);
    const key = vocabKey(lemmaKey, lang);
    if (existingKeys.has(key)) {
      skipped.push(surface);
      continue;
    }
    const gloss = await glossLemma(lemmaKey, lang, surface);
    const headword = gloss.lemma || lemmaKey;
    const item: VocabularyItem = {
      id: nextVocabId(list),
      word: headword,
      lemma: headword,
      zh: gloss.zh,
      reading: gloss.reading,
      partOfSpeech: gloss.partOfSpeech,
      glossEn: gloss.glossEn,
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
      const gloss = await glossPattern(item.pattern, lang, item.zh, knownKeys);
      item.zh = gloss.zh;
      item.grammar = sanitizeStoredGrammar(gloss.grammar);
      updated.push(item);
    }
    pack.manifest.patterns = list;
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
