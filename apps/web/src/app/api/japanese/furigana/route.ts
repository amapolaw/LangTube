import { NextResponse } from "next/server";
import { toFuriganaHiragana } from "@/lib/kuroshiro-server";
import { hasKanji, isJapaneseText } from "@/lib/japanese-ruby";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text : "";
    if (!text) {
      return NextResponse.json({ html: "" });
    }
    if (!isJapaneseText(text) || !hasKanji(text)) {
      return NextResponse.json({ html: text, skipped: true });
    }
    const html = await toFuriganaHiragana(text);
    return NextResponse.json({ html });
  } catch (error) {
    console.error("[furigana]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "furigana failed" },
      { status: 500 }
    );
  }
}
