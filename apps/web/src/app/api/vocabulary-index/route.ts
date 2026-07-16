import { NextResponse } from "next/server";
import { buildVocabularyIndex } from "@/lib/vocab-index";

export async function GET() {
  const hits = await buildVocabularyIndex();
  return NextResponse.json({ hits });
}
