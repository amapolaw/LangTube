import { NextResponse } from "next/server";
import { readSettings, writeSettings, readProfile, writeProfile } from "@/lib/data";

export async function GET() {
  const settings = await readSettings();
  const profile = await readProfile();
  return NextResponse.json({ settings, profile });
}

export async function PUT(req: Request) {
  const body = await req.json();
  if (body.settings) await writeSettings(body.settings);
  if (body.profile) await writeProfile(body.profile);
  return NextResponse.json({ ok: true });
}
