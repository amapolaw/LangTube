import type { VocabularyItem, PatternItem, SupportedLanguage } from "@langtube/core";

export interface TranscriptLineInput {
  id: string;
  text: string;
  translation: string;
}

export function extractVocabulary(
  lines: TranscriptLineInput[],
  lang: SupportedLanguage = "ja"
): VocabularyItem[] {
  const words = new Map<
    string,
    { word: string; zh: string; sentenceIds: string[] }
  >();

  for (const line of lines) {
    const tokens = tokenize(line.text, lang);
    for (const token of tokens) {
      if (token.length < 2) continue;
      const key = token.toLowerCase();
      const existing = words.get(key);
      if (existing) {
        if (!existing.sentenceIds.includes(line.id)) {
          existing.sentenceIds.push(line.id);
        }
      } else {
        words.set(key, {
          word: token,
          zh: line.translation || "",
          sentenceIds: [line.id],
        });
      }
    }
  }

  return Array.from(words.values()).map((w, i) => ({
    id: `vocab-${i + 1}`,
    ...w,
  }));
}

export function extractPatterns(lines: TranscriptLineInput[]): PatternItem[] {
  return lines.map((line, i) => ({
    id: `pattern-${i + 1}`,
    pattern: line.text,
    zh: line.translation,
    grammar: "句型",
  }));
}

function tokenize(text: string, lang: SupportedLanguage): string[] {
  if (lang === "ja") {
    const tokens: string[] = [];
    const kanjiKana = text.match(/[\u4e00-\u9fff\u3040-\u30ffー]+/g) ?? [];
    tokens.push(...kanjiKana);
    const alpha = text.match(/[A-Za-z][A-Za-z0-9]*/g) ?? [];
    tokens.push(...alpha);
    return [...new Set(tokens.filter((t) => t.length >= 1))];
  }
  return [
    ...new Set(
      text
        .split(/[\s,.;:!?，。；：！？]+/)
        .map((w) => w.replace(/[^\w\u00C0-\u024F]/g, ""))
        .filter((w) => w.length >= 2)
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
