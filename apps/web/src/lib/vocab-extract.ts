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
]);

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
      const key = token.word.toLowerCase();
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
 * 句型：整句原文 + 中文意思（翻译）+ 占位 grammar（后续 enrich 补讲解）
 */
export function extractPatterns(lines: TranscriptLineInput[]): PatternItem[] {
  return lines
    .filter((line) => line.text.trim().length >= 2)
    .map((line, i) => ({
      id: `pattern-${i + 1}`,
      pattern: line.text.trim(),
      zh: (line.translation || "").trim(),
      grammar: "句型",
      examples: [],
    }));
}

function tokenizeWestern(text: string, lang: SupportedLanguage): string[] {
  const stop = lang === "es" || lang === "fr" ? ES_STOP : EN_STOP;
  return [
    ...new Set(
      text
        .split(/[\s,.;:!?¡¿«»""''，。；：！？]+/)
        .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
        .filter((w) => {
          if (w.length < 2 || w.length > 24) return false;
          if (stop.has(w.toLowerCase())) return false;
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
