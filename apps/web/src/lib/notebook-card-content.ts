import type { NotebookCard } from "@langtube/core";

export type CardFaceContent = {
  title: string;
  subtitle?: string;
  hint: string;
};

export type CardBackContent = {
  translation: string;
  reading?: string;
  partOfSpeech?: string;
  explanation?: string;
  examples: string[];
};

/** 兼容旧卡片：back 可能是「翻译\\n讲解」 */
export function parseCardBack(card: NotebookCard): CardBackContent {
  const lines = (card.back ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const translation = lines[0] ?? card.back ?? "";
  const fromBackExtra = lines.slice(1).join("\n");

  return {
    translation,
    reading: card.reading,
    partOfSpeech: card.partOfSpeech,
    explanation: card.explanation || fromBackExtra || undefined,
    examples: card.examples ?? [],
  };
}

export function getFrontFace(
  card: NotebookCard,
  direction: "l2-l1" | "l1-l2"
): CardFaceContent {
  const back = parseCardBack(card);
  if (direction === "l2-l1") {
    return {
      title: card.front,
      subtitle: card.reading,
      hint: "点击翻面 · 看释义与用法",
    };
  }
  return {
    title: back.translation || "（暂无翻译）",
    subtitle: back.partOfSpeech,
    hint: "点击翻面 · 看原文",
  };
}

export function typeLabel(type: NotebookCard["type"]): string {
  switch (type) {
    case "vocabulary":
      return "词汇";
    case "pattern":
      return "句型";
    case "listening":
      return "听力";
    case "drill":
      return "Drill";
    case "writing":
      return "写作";
    default:
      return type;
  }
}
