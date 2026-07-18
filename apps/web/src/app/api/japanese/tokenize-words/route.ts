import { NextResponse } from "next/server";
import { tokenizeJapaneseForSelection } from "@/lib/japanese-tokenize";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text : "";
    const texts = Array.isArray(body?.texts)
      ? body.texts.filter((t: unknown) => typeof t === "string")
      : text
        ? [text]
        : [];

    if (!texts.length) {
      return NextResponse.json({ segments: [], byText: {} });
    }

    const byText: Record<string, Awaited<ReturnType<typeof tokenizeJapaneseForSelection>>> =
      {};
    for (const t of texts) {
      byText[t] = await tokenizeJapaneseForSelection(t);
    }

    return NextResponse.json({
      segments: byText[texts[0]] ?? [],
      byText,
    });
  } catch (error) {
    console.error("[tokenize-words]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "tokenize failed" },
      { status: 500 }
    );
  }
}
