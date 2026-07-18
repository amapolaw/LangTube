import type { ContentPack, TranscriptLine } from "@langtube/core";
import {
  looksLikeFragmentedTranscript,
  mergeTranscriptIntoSentences,
  shouldMergeTranscriptSentences,
} from "@/lib/transcript-sentence-merge";

/**
 * 仅写入字幕时间轴与分段；不再批量抽取词汇/句型（省 Token）。
 * 词汇与句型由听辨页点选后按需解析写入。
 */
export async function applyTranscriptLines(
  pack: ContentPack,
  lines: TranscriptLine[]
): Promise<ContentPack> {
  const lang = pack.manifest.sourceLang;
  let normalized = lines;
  if (
    shouldMergeTranscriptSentences(lang) &&
    looksLikeFragmentedTranscript(lines, lang)
  ) {
    normalized = mergeTranscriptIntoSentences(lines, lang);
  }

  const duration =
    normalized.length > 0 ? normalized[normalized.length - 1]!.end : 600;

  pack.transcript.lines = normalized;
  // 保留用户已按需解析的词汇/句型；若此前无字幕则保持空数组
  if (!Array.isArray(pack.manifest.vocabulary)) pack.manifest.vocabulary = [];
  if (!Array.isArray(pack.manifest.patterns)) pack.manifest.patterns = [];
  pack.manifest.parseStatus = "ready";
  pack.manifest.enrichmentMode = "rules";
  const durationMinutes = Math.max(1, Math.round(duration / 60));
  pack.manifest.segments = {
    extensive: [
      {
        start: 0,
        end: duration,
        reason: "全片字幕跟随，适合泛听建立整体语境",
        durationMinutes,
      },
    ],
    intensive: [
      {
        start: Math.min(60, duration * 0.3),
        end: duration,
        reason: "默认可精听全片；可用开始/结束秒收窄区间",
        durationMinutes,
      },
    ],
  };
  pack.segments = pack.manifest.segments;
  pack.manifest.updatedAt = new Date().toISOString();
  return pack;
}

export function durationFromManifest(
  manifest: ContentPack["manifest"]
): number {
  const ext = manifest.segments?.extensive?.[0];
  return ext?.end ?? 600;
}
