/**
 * LangTube 解析省 Token 策略（与 parse-rules 语种规则并用）
 * 由 token-cost-optimizer skill 对齐。
 */

export const LONG_MEDIA_LINE_THRESHOLD = 200;
/** 超过该秒数视为长素材，须询问分段时长 */
export const LONG_MEDIA_DURATION_SEC = 15 * 60;
export const DEFAULT_SEGMENT_MINUTES = 10;
export const SEGMENT_MINUTE_CHOICES = [5, 10, 15, 20, 30] as const;

export type ParseConsent = {
  /** 用户已确认可不手传字幕、可走提取/转写 */
  allowAutoSubtitles?: boolean;
  /** 用户确认开始解析 */
  startParse?: boolean;
  /** 分段时长（分钟）；长素材必填 */
  segmentMinutes?: number;
  /** 只解析该时间窗（秒）；由分段推导 */
  rangeStartSec?: number;
  rangeEndSec?: number;
};

export function isLongMaterial(opts: {
  lineCount?: number;
  durationSec?: number;
}): boolean {
  if ((opts.lineCount ?? 0) >= LONG_MEDIA_LINE_THRESHOLD) return true;
  if ((opts.durationSec ?? 0) >= LONG_MEDIA_DURATION_SEC) return true;
  return false;
}

export function transcriptDurationSec(
  lines: { start: number; end: number }[]
): number {
  if (!lines.length) return 0;
  return Math.max(...lines.map((l) => l.end), 0);
}

export function needsSegmentMinutesConfirm(opts: {
  lineCount?: number;
  durationSec?: number;
  segmentMinutes?: number;
}): boolean {
  return (
    isLongMaterial(opts) &&
    !(opts.segmentMinutes && opts.segmentMinutes > 0)
  );
}

export function resolveParseWindow(opts: {
  durationSec: number;
  segmentMinutes?: number;
  rangeStartSec?: number;
  rangeEndSec?: number;
}): { start: number; end: number } | null {
  if (
    typeof opts.rangeStartSec === "number" &&
    typeof opts.rangeEndSec === "number" &&
    opts.rangeEndSec > opts.rangeStartSec
  ) {
    return { start: opts.rangeStartSec, end: opts.rangeEndSec };
  }
  if (opts.segmentMinutes && opts.segmentMinutes > 0 && opts.durationSec > 0) {
    const end = Math.min(opts.durationSec, opts.segmentMinutes * 60);
    return { start: 0, end };
  }
  return null;
}
