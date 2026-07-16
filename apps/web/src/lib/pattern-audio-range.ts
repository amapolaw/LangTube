import type { SupportedLanguage, TranscriptLine } from "@langtube/core";

function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function joinWindow(
  lines: TranscriptLine[],
  from: number,
  to: number,
  lang: SupportedLanguage
): string {
  const parts = lines.slice(from, to + 1).map((l) => normalizeText(l.text));
  return parts.join(lang === "ja" ? "" : " ");
}

/**
 * 将句型原文对齐到字幕时间轴。
 * 合并多行解析的句型需覆盖全部相关字幕行的 start–end，避免只播半句。
 */
export function resolvePatternAudioRange(
  pattern: string,
  lines: TranscriptLine[],
  lang: SupportedLanguage = "en"
): { start: number; end: number; lineIds: string[] } {
  const target = normalizeText(pattern);
  if (!target || !lines.length) {
    return { start: 0, end: 3, lineIds: [] };
  }

  const exact = lines.find((l) => normalizeText(l.text) === target);
  if (exact) {
    return { start: exact.start, end: exact.end, lineIds: [exact.id] };
  }

  const container = lines.find((l) => {
    const t = normalizeText(l.text);
    return t.includes(target) && target.length >= 8;
  });
  if (container) {
    return {
      start: container.start,
      end: container.end,
      lineIds: [container.id],
    };
  }

  let best: {
    start: number;
    end: number;
    lineIds: string[];
    score: number;
  } | null = null;

  const maxWindow = Math.min(lines.length, 20);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i; j < Math.min(lines.length, i + maxWindow); j++) {
      const joined = joinWindow(lines, i, j, lang);
      if (!joined) continue;

      const covers =
        joined.includes(target) ||
        target.includes(joined) ||
        // 容忍标点/空格差异：去掉非字母数字后再比
        stripPunct(joined).includes(stripPunct(target)) ||
        stripPunct(target).includes(stripPunct(joined));

      if (!covers) {
        if (joined.length > target.length * 1.8) break;
        continue;
      }

      const shorter = Math.min(joined.length, target.length);
      const longer = Math.max(joined.length, target.length);
      const coverage = shorter / longer;
      // 优先覆盖完整句型；同等覆盖时偏好更短窗口
      const score = coverage * 1000 - (j - i) * 2;
      if (!best || score > best.score) {
        best = {
          start: lines[i]!.start,
          end: lines[j]!.end,
          lineIds: lines.slice(i, j + 1).map((l) => l.id),
          score,
        };
      }

      if (joined.includes(target) || stripPunct(joined).includes(stripPunct(target))) {
        break;
      }
    }
  }

  if (best && best.score > 200) {
    return {
      start: best.start,
      end: Math.max(best.end, best.start + 0.4),
      lineIds: best.lineIds,
    };
  }

  // 回退：收集作为句型子串的字幕行，取连续时间跨度
  const parts = lines.filter((l) => {
    const t = normalizeText(l.text);
    return t.length >= 3 && target.includes(t);
  });
  if (parts.length > 0) {
    const start = Math.min(...parts.map((p) => p.start));
    const end = Math.max(...parts.map((p) => p.end));
    return {
      start,
      end: Math.max(end, start + 0.4),
      lineIds: parts.map((p) => p.id),
    };
  }

  // 无字幕对齐：按语速估时长，仍从 0 起（仅兜底）
  const units =
    lang === "ja"
      ? Math.max(1, target.replace(/\s+/g, "").length)
      : Math.max(1, target.split(/\s+/).filter(Boolean).length);
  const wps = lang === "ja" ? 5.5 : 2.4;
  return { start: 0, end: Math.max(3, units / wps), lineIds: [] };
}

function stripPunct(s: string): string {
  return s.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}
