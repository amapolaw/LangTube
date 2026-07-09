import { NextResponse } from "next/server";
import { saveDrillSession } from "@/lib/notebook-service";

export async function POST(req: Request) {
  const body = await req.json();
  saveDrillSession(body);
  return NextResponse.json({ ok: true });
}
