import { NextResponse } from "next/server";
import { readContentPack } from "@/lib/data";
import {
  parseMaterial,
  triggerParseInBackground,
} from "@/lib/material-parser";
import { shouldParseInBackground } from "@/lib/pack-patterns";

export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let force = false;
  try {
    const body = (await req.json()) as { force?: boolean };
    force = Boolean(body?.force);
  } catch {
    // no body
  }

  const pack = await readContentPack(id);
  const lineCount = pack?.transcript.lines.length ?? 0;

  if (lineCount > 0 && shouldParseInBackground(lineCount)) {
    triggerParseInBackground(id, { force });
    return NextResponse.json({
      parseStatus: "processing",
      lines: lineCount,
      message: `后台解析中（${lineCount} 行字幕，词汇/句型将全量生成，请稍候自动刷新）`,
      stage: "enriching",
    });
  }

  const result = await parseMaterial(id, { force });
  return NextResponse.json(result);
}
