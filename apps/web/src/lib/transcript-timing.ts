import type { TranscriptLine, SupportedLanguage } from "@langtube/core";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 检测粘贴纯文本时生成的「等间隔假时间轴」（默认每行 5 秒）。
 */
export function hasSyntheticUniformTiming(
  lines: TranscriptLine[],
  expectedStep = 5,
  tolerance = 0.08
): boolean {
  if (lines.length < 8) return false;
  const sample = Math.min(lines.length, 50);
  let uniform = 0;
  for (let i = 0; i < sample; i++) {
    const line = lines[i]!;
    const dur = line.end - line.start;
    if (Math.abs(dur - expectedStep) <= tolerance) uniform += 1;
    if (i > 0) {
      const prev = lines[i - 1]!;
      if (Math.abs(line.start - prev.end) > tolerance) return false;
    }
  }
  return uniform >= sample * 0.9;
}

/** 全局平移字幕时间（秒，可负） */
export function applySubtitleTimeOffset(
  lines: TranscriptLine[],
  offsetSec: number
): TranscriptLine[] {
  if (!offsetSec) return lines.map((l, i) => ({ ...l, id: `line-${i + 1}` }));
  return lines.map((l, i) => {
    const start = Math.max(0, l.start + offsetSec);
    const end = Math.max(start + 0.2, l.end + offsetSec);
    return { ...l, id: `line-${i + 1}`, start: round2(start), end: round2(end) };
  });
}

function speechUnits(text: string, lang: SupportedLanguage): number {
  const t = text.trim();
  if (!t) return 1;
  if (lang === "ja") {
    return Math.max(1, t.replace(/\s+/g, "").length);
  }
  return Math.max(1, t.split(/\s+/).filter(Boolean).length);
}

/**
 * 按语速估算每行起止时间；可选整体缩放到目标视频时长。
 * 用于修复粘贴字幕的假时间轴，使跟随字幕与语音大致对齐。
 */
export function retimeBySpeechRate(
  lines: TranscriptLine[],
  opts: {
    lang?: SupportedLanguage;
    wordsPerSecond?: number;
    targetDurationSec?: number;
    startOffsetSec?: number;
  } = {}
): TranscriptLine[] {
  const lang = opts.lang ?? "en";
  const wps =
    opts.wordsPerSecond ??
    (lang === "ja" ? 5.5 : lang === "es" || lang === "fr" ? 2.6 : 2.35);
  const startOffset = Math.max(0, opts.startOffsetSec ?? 0);
  let t = startOffset;

  const timed = lines.map((l, i) => {
    const units = speechUnits(l.text, lang);
    let dur = units / wps;
    // 口语行最短/最长钳制
    dur = Math.max(1.1, Math.min(lang === "ja" ? 10 : 12, dur));
    const start = t;
    const end = t + dur;
    t = end + 0.06;
    return {
      ...l,
      id: `line-${i + 1}`,
      start: round2(start),
      end: round2(end),
    };
  });

  if (
    opts.targetDurationSec &&
    opts.targetDurationSec > startOffset + 30 &&
    timed.length > 0
  ) {
    const last = timed[timed.length - 1]!;
    const span = last.end - startOffset;
    if (span > 1) {
      const targetSpan = opts.targetDurationSec - startOffset;
      const scale = targetSpan / span;
      return timed.map((l) => ({
        ...l,
        start: round2(startOffset + (l.start - startOffset) * scale),
        end: round2(startOffset + (l.end - startOffset) * scale),
      }));
    }
  }

  return timed;
}

/** 用带真实时间轴的字幕覆盖文本对应行的时间（按顺序 / 模糊文本匹配） */
export function mergeTimingsFromReference(
  textLines: TranscriptLine[],
  timedLines: TranscriptLine[]
): TranscriptLine[] {
  if (!timedLines.length) return textLines;
  if (textLines.length === timedLines.length) {
    return textLines.map((l, i) => ({
      ...l,
      id: `line-${i + 1}`,
      start: timedLines[i]!.start,
      end: timedLines[i]!.end,
    }));
  }
  // 长度不同时：按索引比例映射时间窗
  return textLines.map((l, i) => {
    const ratio = textLines.length <= 1 ? 0 : i / (textLines.length - 1);
    const j = Math.min(
      timedLines.length - 1,
      Math.round(ratio * (timedLines.length - 1))
    );
    const ref = timedLines[j]!;
    return {
      ...l,
      id: `line-${i + 1}`,
      start: ref.start,
      end: ref.end,
    };
  });
}
