/**
 * 按句子长度调整 Drill「回应时限」。
 * 短句约 3 秒；日语按字数、其他语言按词/字符加权。
 */
export function calcDrillTimeLimitMs(options: {
  basePattern: string;
  expected?: string;
  prompt?: string;
  sourceLang?: string;
}): number {
  const { basePattern, expected = "", prompt = "", sourceLang } = options;
  const sample = [expected, basePattern, prompt]
    .map((s) => s.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? "";

  const isJa = sourceLang === "ja" || /[\u3040-\u30ff\u4e00-\u9fff]/.test(sample);
  const compact = sample.replace(/\s+/g, "");
  const len = compact.length;

  // 基准：短句 3s；日语每多 1 字约 +280ms，其他语言约 +180ms
  const baseMs = 3000;
  const threshold = isJa ? 8 : 15;
  const perUnit = isJa ? 280 : 180;
  const extra = Math.max(0, len - threshold) * perUnit;

  // 下限 3s，上限 12s，避免过长句拖垮节奏
  return Math.min(12000, Math.max(baseMs, baseMs + extra));
}

export function formatTimeLimitLabel(ms: number): string {
  const sec = ms / 1000;
  if (sec <= 3.05) return "3 秒内回应";
  return `${sec.toFixed(1).replace(/\.0$/, "")} 秒内回应（按时长调整）`;
}
