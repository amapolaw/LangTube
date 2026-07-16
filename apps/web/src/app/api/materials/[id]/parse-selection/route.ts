import { NextResponse } from "next/server";
import { readContentPack, saveContentPack } from "@/lib/data";
import {
  parseSelectedPatterns,
  parseSelectedVocabulary,
} from "@/lib/parse-selection";

export const maxDuration = 120;

/**
 * 按需解析：用户在听辨页点选单词 / 多选字幕句后再调用。
 * body:
 *  - { kind: "vocabulary", words?: string[], lineIds?: string[], vocabIds?: string[], reparse?: boolean }
 *  - { kind: "patterns", lineIds?: string[], patternIds?: string[], merge?: boolean, reparse?: boolean }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pack = await readContentPack(id);
  if (!pack) {
    return NextResponse.json({ error: "素材不存在" }, { status: 404 });
  }

  let body: {
    kind?: string;
    words?: string[];
    lineIds?: string[];
    vocabIds?: string[];
    patternIds?: string[];
    merge?: boolean;
    reparse?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "无效 JSON" }, { status: 400 });
  }

  const kind = body.kind;
  if (kind === "vocabulary") {
    const result = await parseSelectedVocabulary(pack, {
      words: Array.isArray(body.words) ? body.words : undefined,
      lineIds: Array.isArray(body.lineIds) ? body.lineIds : undefined,
      vocabIds: Array.isArray(body.vocabIds) ? body.vocabIds : undefined,
      reparse: Boolean(body.reparse),
    });
    await saveContentPack(pack);
    return NextResponse.json({
      ok: true,
      kind,
      ...result,
    });
  }

  if (kind === "patterns") {
    const result = await parseSelectedPatterns(pack, {
      lineIds: Array.isArray(body.lineIds) ? body.lineIds : undefined,
      patternIds: Array.isArray(body.patternIds) ? body.patternIds : undefined,
      merge: body.merge,
      reparse: Boolean(body.reparse),
    });
    await saveContentPack(pack);
    return NextResponse.json({
      ok: true,
      kind,
      ...result,
    });
  }

  return NextResponse.json(
    { error: "kind 须为 vocabulary 或 patterns" },
    { status: 400 }
  );
}
