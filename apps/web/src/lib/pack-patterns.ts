import type { ContentPack } from "@langtube/core";
import {
  filterTranscriptForLearning,
  isCompleteLearningSentence,
} from "@/lib/transcript-noise-filter";

/**
 * 句型表：仅完整学习句（去噪后），不再 1:1 全量铺满以省 token。
 * 保留已有 grammar/zh；新句用默认讲解占位。
 */
export function ensureFullPatterns(pack: ContentPack): void {
  const lang = pack.manifest.sourceLang;
  const byText = new Map(
    pack.manifest.patterns.map((p) => [
      p.pattern.replace(/\s+/g, " ").trim(),
      p,
    ])
  );

  const { kept } = filterTranscriptForLearning(pack.transcript.lines, lang);
  const seen = new Set<string>();
  const out = [];

  for (const l of kept) {
    const text = l.text.trim();
    if (!isCompleteLearningSentence(text, lang)) continue;
    const key = text.replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = byText.get(key);
    out.push({
      id: `pattern-${out.length + 1}`,
      pattern: text,
      zh: (hit?.zh || l.translation || "").trim(),
      grammar:
        hit?.grammar && hit.grammar !== "句型"
          ? hit.grammar
          : "结合语境理解本句表达功能与搭配",
      examples: hit?.examples,
    });
  }

  // 若过滤后为空，回退保留既有非空句型（避免误清空）
  pack.manifest.patterns = out.length
    ? out
    : pack.manifest.patterns.filter((p) =>
        isCompleteLearningSentence(p.pattern, lang)
      );
}

export function adaptiveBatchSize(lineCount: number): number {
  // 更小批次：降低单次 LLM 输入
  if (lineCount > 800) return 60;
  if (lineCount > 400) return 50;
  if (lineCount > 150) return 40;
  return 30;
}

/** 长素材应后台解析，避免 HTTP 超时 */
export function shouldParseInBackground(lineCount: number): boolean {
  return lineCount > 80;
}
