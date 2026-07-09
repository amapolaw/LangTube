import { NextResponse } from "next/server";
import { readContentPack, saveContentPack } from "@/lib/data";
import {
  extractVocabulary,
  extractPatterns,
  parseTranscriptText,
} from "@/lib/vocab-extract";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const pack = await readContentPack(id);
  if (!pack) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.transcriptText) {
    const lines = parseTranscriptText(body.transcriptText);
    pack.transcript.lines = lines;
    pack.manifest.vocabulary = extractVocabulary(
      lines,
      pack.manifest.sourceLang
    );
    pack.manifest.patterns = extractPatterns(lines);
    pack.manifest.parseStatus = lines.length > 0 ? "ready" : "pending";
    const duration = lines.length > 0 ? lines[lines.length - 1].end : 600;
    pack.manifest.segments = {
      extensive: [
        {
          start: 0,
          end: Math.min(180, duration),
          reason: "开头部分适合泛听",
          durationMinutes: 3,
        },
      ],
      intensive: [
        {
          start: Math.min(60, duration * 0.3),
          end: Math.min(duration, duration * 0.6 + 120),
          reason: "核心段落适合精听",
          durationMinutes: 10,
        },
      ],
    };
    pack.segments = pack.manifest.segments;
  }

  if (body.storage) {
    pack.storage = body.storage;
    pack.manifest.storage = body.storage;
  }

  pack.manifest.updatedAt = new Date().toISOString();
  await saveContentPack(pack);
  return NextResponse.json(pack);
}
