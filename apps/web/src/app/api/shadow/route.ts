import { NextResponse } from "next/server";
import { textSimilarity } from "@langtube/core";
import { saveShadowSession, addWeakItem } from "@/lib/notebook-service";

export async function POST(req: Request) {
  const body = await req.json();
  const similarity = textSimilarity(body.transcript, body.userSpeech ?? "");
  saveShadowSession({ ...body, similarity });

  if (similarity < 0.6) {
    addWeakItem({
      text: body.transcript,
      translation: body.translation ?? "",
      source: "read",
      materialId: body.materialId,
    });
  }

  return NextResponse.json({ similarity });
}
