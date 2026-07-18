import type {
  ContentPack,
  PatternItem,
  SupportedLanguage,
  TranscriptLine,
  VocabularyItem,
} from "@langtube/core";
import { isSourceLanguageText } from "@/lib/japanese-pattern-grammar";
import { normalizeEsPatternCard, normalizeEsVocabCard } from "@/lib/spanish-card";
import { normalizeFrPatternCard, normalizeFrVocabCard } from "@/lib/french-card";

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/** 日语词性 → 中文展示（与听辨页 mrfs6rgb 一致） */
export function jaPartOfSpeechLabel(pos?: string): string | undefined {
  const p = pos?.trim();
  if (!p) return undefined;
  if (/[\u4e00-\u9fff]/.test(p) && !/\b(Godan|Transitive|Intransitive|verb|Adverb)\b/i.test(p)) {
    return p;
  }
  const lower = p.toLowerCase();
  if (lower.includes("transitive") && lower.includes("intransitive")) return "自他动词";
  if (lower.includes("transitive")) return "他动词";
  if (lower.includes("intransitive")) return "自动词";
  if (lower.includes("adverb") || p.includes("副詞")) return "副词";
  if (lower.includes("noun") || p.includes("名詞")) return "名词";
  if (lower.includes("verb") || p.includes("動詞")) return "动词";
  if (p.includes("連体詞")) return "连体词";
  if (p.includes("形容詞")) return "形容词";
  if (p.includes("形容動詞")) return "形容动词";
  return undefined;
}

/** 词汇表展示用中文释义（过滤源语言回落） */
export function vocabDisplayZh(
  item: Pick<VocabularyItem, "zh" | "word">,
  lang: SupportedLanguage
): string | undefined {
  const zh = item.zh?.trim();
  if (!zh || !hasChinese(zh) || isSourceLanguageText(zh, lang)) return undefined;
  if (zh === "（暂无中文释义）") return undefined;
  return zh;
}

/** @deprecated 使用 vocabDisplayZh */
export function jaVocabDisplayZh(
  item: Pick<VocabularyItem, "zh" | "word">,
  lang: SupportedLanguage
): string | undefined {
  return vocabDisplayZh(item, lang);
}

/** 句型展示用中文句意 */
export function patternDisplayZh(
  item: Pick<PatternItem, "zh" | "pattern">,
  lang: SupportedLanguage
): string | undefined {
  const zh = item.zh?.trim();
  if (!zh || !hasChinese(zh) || isSourceLanguageText(zh, lang)) return undefined;
  return zh;
}

/** @deprecated 使用 patternDisplayZh */
export function jaPatternDisplayZh(
  item: Pick<PatternItem, "zh" | "pattern">,
  lang: SupportedLanguage
): string | undefined {
  return patternDisplayZh(item, lang);
}

/** 写入 manifest / 听辨卡片前规范化日语词条（去掉 glossEn，统一词性） */
export function normalizeJaVocabCard(item: VocabularyItem): VocabularyItem {
  const word = (item.lemma?.trim() || item.word).trim();
  const zh = vocabDisplayZh(item, "ja");
  return {
    ...item,
    word,
    lemma: word,
    zh: zh ?? item.zh,
    reading: item.reading?.trim() || undefined,
    partOfSpeech: jaPartOfSpeechLabel(item.partOfSpeech),
    glossEn: undefined,
    glossJa: undefined,
  };
}

export function normalizeJaPatternCard(item: PatternItem): PatternItem {
  const zh = patternDisplayZh(item, "ja");
  return {
    ...item,
    zh: zh ?? item.zh,
  };
}

export function normalizeJaManifestCards(pack: ContentPack): void {
  if (pack.manifest.sourceLang !== "ja") return;
  pack.manifest.vocabulary = pack.manifest.vocabulary.map(normalizeJaVocabCard);
  pack.manifest.patterns = pack.manifest.patterns.map(normalizeJaPatternCard);
}

export function jaNotebookExampleLines(
  lines: TranscriptLine[],
  lang: SupportedLanguage
): string[] {
  return lines
    .slice(0, 3)
    .map((l) => {
      const tr = l.translation?.trim();
      if (tr && hasChinese(tr) && !isSourceLanguageText(tr, lang)) {
        return `${l.text} / ${tr}`;
      }
      return l.text;
    })
    .filter(Boolean);
}

export function buildNotebookVocabPayload(
  v: VocabularyItem,
  pack: ContentPack
) {
  const lang = pack.manifest.sourceLang;
  const normalized =
    lang === "ja"
      ? normalizeJaVocabCard(v)
      : lang === "es"
        ? normalizeEsVocabCard(v)
        : lang === "fr"
          ? normalizeFrVocabCard(v)
          : v;
  const zh = vocabDisplayZh(normalized, lang) || normalized.zh || "";
  const exampleLines = jaNotebookExampleLines(
    (normalized.sentenceIds ?? [])
      .map((sid) => pack.transcript.lines.find((l) => l.id === sid))
      .filter((l): l is TranscriptLine => Boolean(l)),
    lang
  );
  const pos = lang === "ja" ? jaPartOfSpeechLabel(normalized.partOfSpeech) : normalized.partOfSpeech;
  const explanationParts: string[] = [];
  if (pos) explanationParts.push(`词性：${pos}`);
  if (normalized.notes?.trim()) explanationParts.push(normalized.notes.trim());

  return {
    type: "vocabulary" as const,
    front: normalized.word,
    back: zh,
    reading: normalized.reading,
    partOfSpeech: pos,
    explanation: explanationParts.length ? explanationParts.join("\n") : undefined,
    examples: exampleLines,
    language: lang,
    materialId: pack.manifest.id,
    tags: pack.manifest.topics ?? [],
  };
}

export function buildNotebookPatternPayload(
  p: PatternItem,
  pack: ContentPack
) {
  const lang = pack.manifest.sourceLang;
  const normalized =
    lang === "ja"
      ? normalizeJaPatternCard(p)
      : lang === "es"
        ? normalizeEsPatternCard(p)
        : lang === "fr"
          ? normalizeFrPatternCard(p)
          : p;
  const zh = patternDisplayZh(normalized, lang) || normalized.zh || "";

  return {
    type: "pattern" as const,
    front: normalized.pattern,
    back: zh,
    explanation: normalized.grammar?.trim() || undefined,
    examples: normalized.examples ?? [],
    language: lang,
    materialId: pack.manifest.id,
    tags: pack.manifest.topics ?? [],
  };
}
