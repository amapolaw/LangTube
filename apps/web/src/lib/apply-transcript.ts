import type { ContentPack, TranscriptLine } from "@langtube/core";
import {
  extractVocabulary,
  extractPatterns,
  isLikelyWordNotPhrase,
  isBasicSkipWord,
} from "@/lib/vocab-extract";

export async function applyTranscriptLines(
  pack: ContentPack,
  lines: TranscriptLine[]
): Promise<ContentPack> {
  const duration = lines.length > 0 ? lines[lines.length - 1].end : 600;

  pack.transcript.lines = lines;
  const vocab = await extractVocabulary(lines, pack.manifest.sourceLang);
  pack.manifest.vocabulary = vocab.filter(
    (v) =>
      isLikelyWordNotPhrase(v.word, pack.manifest.sourceLang) &&
      !isBasicSkipWord(v.word, pack.manifest.sourceLang)
  );
  pack.manifest.patterns = extractPatterns(lines, pack.manifest.sourceLang);
  // 仅写入字幕；ready 由 material-parser 在增强达标后设置
  pack.manifest.parseStatus = "pending";
  pack.manifest.enrichmentMode = undefined;
  // 字幕跟随覆盖全片；勿把 extensive 写成固定 3 分钟，否则听辨页 3 分钟后无字幕
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
