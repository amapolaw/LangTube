import type { NotebookCard } from "@langtube/core";
import { chatCompletion } from "@/lib/llm/client";
import {
  lookupDictionary,
  japaneseQueryCandidates,
  type DictionaryLookup,
} from "@/lib/dictionary/lookup";

export type CardEnrichment = {
  back: string;
  reading?: string;
  partOfSpeech?: string;
  explanation?: string;
  examples: string[];
  dictSource: string;
};

export function needsDictionaryEnrichment(card: NotebookCard): boolean {
  const backOk = Boolean(card.back?.trim()) && card.back.trim() !== "句型";
  const explainOk = Boolean(card.explanation?.trim());
  const examplesOk = (card.examples?.length ?? 0) > 0;
  return !backOk || !explainOk || !examplesOk;
}

function buildPos(lookup: DictionaryLookup): string | undefined {
  const pos = lookup.senses.flatMap((s) => s.partOfSpeech).filter(Boolean);
  return [...new Set(pos)].slice(0, 4).join(" · ") || undefined;
}

function buildUsageEn(lookup: DictionaryLookup): string {
  return lookup.senses
    .slice(0, 3)
    .map((s, i) => {
      const pos = s.partOfSpeech.join(", ");
      const gloss = s.glossEn.join("; ");
      const info = s.info?.length ? `（${s.info.join("；")}）` : "";
      return `${i + 1}. ${pos ? `[${pos}] ` : ""}${gloss}${info}`;
    })
    .join("\n");
}

async function translateEnToZh(text: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed.slice(0, 450))}&langpair=en|zh-CN`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      responseData?: { translatedText?: string };
    };
    const out = data.responseData?.translatedText?.trim();
    if (!out || /MYMEMORY WARNING/i.test(out)) return null;
    return out;
  } catch {
    return null;
  }
}

async function glossesToChinese(lookup: DictionaryLookup): Promise<{
  back: string;
  explanation: string;
}> {
  const parts: string[] = [];
  const explainLines: string[] = [];

  for (const [i, sense] of lookup.senses.slice(0, 3).entries()) {
    const en = sense.glossEn.join("; ");
    const zh = (await translateEnToZh(en)) || en;
    parts.push(zh);
    const pos = sense.partOfSpeech.join(" · ");
    explainLines.push(
      `${i + 1}. ${pos ? `【${pos}】` : ""}${zh}` +
        (en !== zh ? `\n   （英：${en}）` : "")
    );
    await new Promise((r) => setTimeout(r, 200));
  }

  return {
    back: parts[0] || lookup.headword,
    explanation: [
      `词头：${lookup.headword}${lookup.reading ? `（${lookup.reading}）` : ""}`,
      ...explainLines,
    ].join("\n"),
  };
}

function defaultExamples(lookup: DictionaryLookup, language: string): string[] {
  if (lookup.examples.length) return lookup.examples.slice(0, 3);
  if (language === "ja") {
    return [
      `${lookup.headword}。`,
      `彼は「${lookup.headword}」と言った。`,
    ];
  }
  return [`I learned the word "${lookup.headword}".`];
}

async function glossToChineseWithLlm(
  front: string,
  language: string,
  lookup: DictionaryLookup | null,
  existingBack?: string
): Promise<{
  back: string;
  explanation: string;
  examples: string[];
  sourceNote: string;
} | null> {
  const dictBlock = lookup
    ? `权威词典条目（必须严格依据，不得编造义项）：
来源：${lookup.source}
词头：${lookup.headword}
读音：${lookup.reading ?? "—"}
义项：
${buildUsageEn(lookup)}
例句：
${(lookup.examples.length ? lookup.examples : ["（词典未提供例句）"]).join("\n")}`
    : `未检索到公开词典条目。请依据权威教材/词典惯例给出稳妥释义，并在 explanation 注明「据通用词典义项整理」。`;

  const system = `你是语言学习词典编辑。根据给定的权威词典材料，为闪卡背面生成中文学习内容。
规则：
1. 释义必须忠实于提供的词典义项；有词典时禁止添加词典没有的义项。
2. 输出严格 JSON：{"back":"中文主释义","explanation":"用法/语法讲解","examples":["例句1","例句2"]}
3. examples 1–3 条；优先改写词典例句。
4. explanation 含词性、搭配或使用场景。
5. 面向母语为中文的学习者。`;

  const user = `目标语：${language}
正面原文：${front}
已有粗译（可参考，以词典为准）：${existingBack || "无"}

${dictBlock}`;

  try {
    const raw = await chatCompletion(system, user);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      back?: string;
      explanation?: string;
      examples?: string[];
    };
    if (!parsed.back?.trim()) return null;
    return {
      back: parsed.back.trim(),
      explanation: (parsed.explanation ?? "").trim(),
      examples: (parsed.examples ?? []).filter(Boolean).slice(0, 3),
      sourceNote: lookup
        ? `${lookup.source} + 中文整理`
        : "据通用词典义项整理",
    };
  } catch {
    return null;
  }
}

/** 长句/句型：抽取关键表达再查词典 */
async function lookupForCard(
  card: NotebookCard
): Promise<DictionaryLookup | null> {
  const direct = await lookupDictionary(card.front, card.language);
  if (direct && direct.headword.length >= 2) {
    // 句型过长时，若只命中虚词（如 だったら），继续找更好词头
    const weak =
      card.front.length > 12 &&
      direct.headword.length <= 4 &&
      /Conjunction|Particle|Prefix|Suffix/i.test(
        direct.senses[0]?.partOfSpeech.join(" ") ?? ""
      );
    if (!weak) return direct;
  }

  if (card.language === "ja") {
    const chunks = japaneseQueryCandidates(card.front)
      .concat(
        [...card.front.matchAll(/[\u4e00-\u9fff々]{2,8}/g)].map((m) => m[0])
      )
      .sort((a, b) => b.length - a.length);

    for (const chunk of [...new Set(chunks)].slice(0, 5)) {
      const hit = await lookupDictionary(chunk, "ja");
      if (hit && hit.headword.length >= 2) return hit;
    }
  }

  return direct;
}

/**
 * 为 Notebook 卡片补全权威词典释义 / 用法 / 例句。
 * 优先 Jisho(JMDict) / Free Dictionary → LLM 中文整理 → 机器翻译英义。
 */
export async function enrichCardFromDictionary(
  card: NotebookCard
): Promise<CardEnrichment | null> {
  const lookup = await lookupForCard(card);

  const llm = await glossToChineseWithLlm(
    card.front,
    card.language,
    lookup,
    card.back
  );

  if (llm) {
    return {
      back: llm.back,
      reading: lookup?.reading || card.reading,
      partOfSpeech: lookup ? buildPos(lookup) : card.partOfSpeech,
      explanation: llm.explanation || undefined,
      examples:
        llm.examples.length > 0
          ? llm.examples
          : lookup
            ? defaultExamples(lookup, card.language)
            : [],
      dictSource: llm.sourceNote,
    };
  }

  if (lookup) {
    const zh = await glossesToChinese(lookup);
    return {
      back: zh.back,
      reading: lookup.reading,
      partOfSpeech: buildPos(lookup),
      explanation: zh.explanation,
      examples: defaultExamples(lookup, card.language),
      dictSource: `${lookup.source}（英义转中文）`,
    };
  }

  return null;
}

export function applyEnrichment(
  card: NotebookCard,
  enrichment: CardEnrichment,
  opts?: { overwrite?: boolean }
): NotebookCard {
  const overwrite = opts?.overwrite ?? false;
  const backWeak =
    !card.back?.trim() ||
    card.back.trim() === "句型" ||
    /^[a-zA-Z]/.test(card.back.trim()); // 英文占位可被中文覆盖

  return {
    ...card,
    back: overwrite || backWeak ? enrichment.back : card.back,
    reading: enrichment.reading || card.reading,
    partOfSpeech: enrichment.partOfSpeech || card.partOfSpeech,
    explanation:
      overwrite || !card.explanation?.trim()
        ? enrichment.explanation
        : card.explanation,
    examples:
      overwrite || !(card.examples && card.examples.length)
        ? enrichment.examples
        : card.examples,
    dictSource: enrichment.dictSource,
  };
}
