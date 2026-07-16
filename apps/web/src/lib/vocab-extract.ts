import type { VocabularyItem, PatternItem, SupportedLanguage } from "@langtube/core";
import { tokenizeJapaneseWords } from "@/lib/japanese-tokenize";

export interface TranscriptLineInput {
  id: string;
  text: string;
  translation: string;
}

const EN_STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "we",
  "you",
  "they",
  "he",
  "she",
  "i",
  "me",
  "my",
  "our",
  "your",
  "their",
  "with",
  "from",
  "as",
  "by",
  "not",
  "no",
  "so",
  "if",
  "than",
  "then",
  "into",
  "about",
  // 疑问词
  "what",
  "who",
  "whom",
  "whose",
  "where",
  "when",
  "why",
  "how",
  "which",
  "whether",
]);

const ES_STOP = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "y",
  "o",
  "de",
  "del",
  "a",
  "en",
  "que",
  "por",
  "con",
  "para",
  "es",
  "son",
  "se",
  "no",
  "lo",
  "al",
  "como",
  "más",
  "pero",
  "su",
  "sus",
  "me",
  "te",
  "le",
  "les",
  "mi",
  "tu",
  "ya",
  "si",
  "sí",
  "yo",
  "tú",
  "él",
  "ella",
  "nosotros",
  "vosotros",
  "ellos",
  "ellas",
  "hay",
  "está",
  "están",
  "ser",
  "estar",
  "muy",
  "también",
  "porque",
  "cuando",
  "donde",
  "qué",
  "quién",
  // 疑问词
  "quiénes",
  "dónde",
  "cuándo",
  "cómo",
  "cuál",
  "cuáles",
  "cuánto",
  "cuánta",
  "cuántos",
  "cuántas",
]);

const FR_STOP = new Set([
  "le",
  "la",
  "les",
  "un",
  "une",
  "des",
  "du",
  "de",
  "et",
  "ou",
  "à",
  "en",
  "dans",
  "sur",
  "pour",
  "par",
  "avec",
  "sans",
  "est",
  "sont",
  "être",
  "avoir",
  "je",
  "tu",
  "il",
  "elle",
  "on",
  "nous",
  "vous",
  "ils",
  "elles",
  "ce",
  "cet",
  "cette",
  "ces",
  "mon",
  "ton",
  "son",
  "ma",
  "ta",
  "sa",
  "mes",
  "tes",
  "ses",
  "ne",
  "pas",
  "plus",
  "très",
  "aussi",
  "qui",
  "que",
  "quoi",
  "où",
  // 疑问词
  "quand",
  "comment",
  "combien",
  "pourquoi",
  "lequel",
  "laquelle",
  "lesquels",
  "lesquelles",
  "quel",
  "quelle",
  "quels",
  "quelles",
]);

/** 日语基础代词 / 助词 / 功能词 — 不进词汇表 */
const JA_BASIC = new Set([
  "私",
  "僕",
  "俺",
  "わたし",
  "ぼく",
  "おれ",
  "あなた",
  "君",
  "これ",
  "それ",
  "あれ",
  "この",
  "その",
  "あの",
  "ここ",
  "そこ",
  "あそこ",
  "どこ",
  "誰",
  "何",
  "です",
  "ます",
  "だ",
  "である",
  "いる",
  "ある",
  "する",
  "なる",
  "はい",
  "いいえ",
  "うん",
  "ええ",
  "なんか",
  "ちょっと",
  "まあ",
  "は",
  "が",
  "を",
  "に",
  "で",
  "と",
  "も",
  "へ",
  "や",
  "の",
  "か",
  "ね",
  "よ",
  "な",
  "わ",
  "さ",
  // 疑问词
  "誰",
  "だれ",
  "何",
  "なに",
  "なん",
  "どこ",
  "いつ",
  "なぜ",
  "どう",
  "どうして",
  "どれ",
  "どの",
  "どちら",
  "どんな",
  "いくら",
  "いくつ",
]);

const EN_FILLERS = new Set([
  "uh",
  "um",
  "erm",
  "hmm",
  "ah",
  "oh",
  "yeah",
  "yep",
  "ok",
  "okay",
  "alright",
]);

/** 是否英文缩写（全大写或含点的缩写） */
export function isLikelyAcronym(word: string): boolean {
  const t = word.trim();
  if (!t) return false;
  if (/^[A-Z]{2,6}$/.test(t)) return true;
  if (/^[A-Z](?:\.[A-Z])+\.?$/.test(t)) return true;
  return false;
}

/** 是否片假名（外来语候选） */
export function isKatakanaLoanword(word: string): boolean {
  const t = word.trim();
  return t.length >= 2 && /^[\u30A0-\u30FFー゛゜]+$/.test(t);
}

/**
 * 是否为基础代词/冠词/助词/疑问词/语气词 — 跳过不展示、不送 LLM。
 * 缩写与专业词（isLikelyAcronym）不跳过。
 */
export function isBasicSkipWord(
  word: string,
  lang: SupportedLanguage
): boolean {
  const t = word.trim();
  if (!t) return true;
  if (isLikelyAcronym(t)) return false;
  const lower = t.toLowerCase();
  if (lang === "ja") return JA_BASIC.has(t) || JA_BASIC.has(lower);
  if (lang === "es") return ES_STOP.has(lower);
  if (lang === "fr") return FR_STOP.has(lower);
  return EN_STOP.has(lower) || EN_FILLERS.has(lower);
}

/**
 * 提取词汇表：只要单词，不要句子/短语片段。
 * 日语走 kuromoji；英西按空白分词并过滤停用词。
 */
export async function extractVocabulary(
  lines: TranscriptLineInput[],
  lang: SupportedLanguage = "ja"
): Promise<VocabularyItem[]> {
  const words = new Map<
    string,
    {
      word: string;
      zh: string;
      reading?: string;
      partOfSpeech?: string;
      sentenceIds: string[];
    }
  >();

  for (const line of lines) {
    const tokens =
      lang === "ja"
        ? await tokenizeJapaneseWords(line.text)
        : tokenizeWestern(line.text, lang).map((w) => ({
            word: w,
            pos: undefined as string | undefined,
            reading: undefined as string | undefined,
          }));

    for (const token of tokens) {
      if (!isLikelyWordNotPhrase(token.word, lang)) continue;
      if (isBasicSkipWord(token.word, lang)) continue;
      const key =
        lang === "ja" ? token.word : token.word.toLowerCase();
      const existing = words.get(key);
      if (existing) {
        if (!existing.sentenceIds.includes(line.id)) {
          existing.sentenceIds.push(line.id);
        }
      } else {
        words.set(key, {
          word: token.word,
          // 词汇表释义留给词库/LLM；不要把整句翻译塞进 zh
          zh: "",
          reading: token.reading,
          partOfSpeech: token.pos,
          sentenceIds: [line.id],
        });
      }
    }
  }

  // 按出现频次优先；全量保留（听辨页滚动展示）
  const ranked = Array.from(words.values()).sort(
    (a, b) => b.sentenceIds.length - a.sentenceIds.length
  );

  return ranked.map((w, i) => ({
    id: `vocab-${i + 1}`,
    word: w.word,
    zh: w.zh,
    reading: w.reading,
    partOfSpeech: w.partOfSpeech,
    sentenceIds: w.sentenceIds,
  }));
}

/**
 * 句型：完整一句原文 + 中文意思 + 占位 grammar（后续 enrich 补讲解）
 * 语气词行 / 碎片句跳过；同句去重。
 */
export function extractPatterns(
  lines: TranscriptLineInput[],
  lang: SupportedLanguage = "ja"
): PatternItem[] {
  const seen = new Set<string>();
  const out: PatternItem[] = [];
  for (const line of lines) {
    const text = line.text.trim();
    if (text.length < 2) continue;
    if (isBasicSkipWord(text, lang)) continue;
    // 完整句启发式：日语长度或西语词数
    if (lang === "ja") {
      if (text.length < 4) continue;
    } else if (text.split(/\s+/).length < 4) {
      continue;
    }
    const key = text.replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `pattern-${out.length + 1}`,
      pattern: text,
      zh: (line.translation || "").trim(),
      grammar: "",
      examples: [],
    });
  }
  return out;
}

function tokenizeWestern(text: string, lang: SupportedLanguage): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,.;:!?¡¿«»""''，。；：！？]+/)
        .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
        .filter((w) => {
          if (w.length < 2 || w.length > 24) return false;
          if (isBasicSkipWord(w, lang)) return false;
          // 排除明显整句残留
          if (/\s/.test(w)) return false;
          return true;
        })
    ),
  ];
}

export function parseTranscriptText(text: string) {
  const lines = text.split("\n").filter((l) => l.trim());
  return lines.map((line, i) => {
    const parts = line.split("|").map((p) => p.trim());
    return {
      id: `line-${i + 1}`,
      start: i * 5,
      end: (i + 1) * 5,
      text: parts[0] ?? line,
      translation: parts[1] ?? "",
    };
  });
}

/** 过滤误入词汇表的句子片段 */
export function isLikelyWordNotPhrase(
  word: string,
  lang: SupportedLanguage
): boolean {
  const t = word.trim();
  if (!t) return false;
  if (/[。！？.!?，,]/.test(t)) return false;
  if (/\s/.test(t) && lang !== "en") return false;
  if (lang === "ja") {
    if (t.length > 12) return false;
    // 含多个助词的长串更像短语
    const particles = t.match(/[はがをにでとへも]/g) ?? [];
    if (particles.length >= 2) return false;
  } else if (t.split(/\s+/).length > 2) {
    return false;
  }
  return true;
}
