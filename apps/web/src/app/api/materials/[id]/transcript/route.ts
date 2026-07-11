import { NextResponse } from "next/server";
import { readContentPack, saveContentPack } from "@/lib/data";
import { parseTranscriptText } from "@/lib/vocab-extract";
import { applyTranscriptLines } from "@/lib/apply-transcript";

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
    await applyTranscriptLines(pack, lines);
  }

  if (body.storage) {
    pack.storage = body.storage;
    pack.manifest.storage = body.storage;
  }

  pack.manifest.updatedAt = new Date().toISOString();
  await saveContentPack(pack);
  return NextResponse.json(pack);
}
