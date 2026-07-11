import type { ContentPack, TranscriptLine } from "@langtube/core";
import {
  extractVocabulary,
  extractPatterns,
  isLikelyWordNotPhrase,
} from "@/lib/vocab-extract";

export async function applyTranscriptLines(
  pack: ContentPack,
  lines: TranscriptLine[]
): Promise<ContentPack> {
  const duration = lines.length > 0 ? lines[lines.length - 1].end : 600;

  pack.transcript.lines = lines;
  const vocab = await extractVocabulary(lines, pack.manifest.sourceLang);
  pack.manifest.vocabulary = vocab.filter((v) =>
    isLikelyWordNotPhrase(v.word, pack.manifest.sourceLang)
  );
  pack.manifest.patterns = extractPatterns(lines);
  // 仅写入字幕；ready 由 material-parser 在增强达标后设置
  pack.manifest.parseStatus = "pending";
  pack.manifest.enrichmentMode = undefined;
  pack.manifest.segments = {
    extensive: [
      {
        start: 0,
        end: Math.min(180, duration),
        reason: "开头部分适合泛听，建立整体语境",
        durationMinutes: 3,
      },
    ],
    intensive: [
      {
        start: Math.min(60, duration * 0.3),
        end: Math.min(duration, duration * 0.6 + 120),
        reason: "核心段落句型密集，适合精听",
        durationMinutes: 10,
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
