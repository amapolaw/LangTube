import type { ContentPack } from "@langtube/core";

/** 句型表与字幕行 1:1 对齐（全量展示） */
export function ensureFullPatterns(pack: ContentPack): void {
  const byText = new Map(
    pack.manifest.patterns.map((p) => [
      p.pattern.replace(/\s+/g, " ").trim(),
      p,
    ])
  );
  const minLen = pack.manifest.sourceLang === "ja" ? 1 : 2;
  pack.manifest.patterns = pack.transcript.lines
    .filter((l) => l.text.trim().length >= minLen)
    .map((l, i) => {
      const key = l.text.replace(/\s+/g, " ").trim();
      const hit = byText.get(key);
      return {
        id: `pattern-${i + 1}`,
        pattern: l.text.trim(),
        zh: (hit?.zh || l.translation || "").trim(),
        grammar:
          hit?.grammar && hit.grammar !== "句型"
            ? hit.grammar
            : "结合语境理解本句表达功能与搭配",
        examples: hit?.examples,
      };
    });
}

export function adaptiveBatchSize(lineCount: number): number {
  if (lineCount > 800) return 100;
  if (lineCount > 400) return 80;
  if (lineCount > 150) return 60;
  return 40;
}

/** 长素材应后台解析，避免 HTTP 超时 */
export function shouldParseInBackground(lineCount: number): boolean {
  return lineCount > 80;
}
