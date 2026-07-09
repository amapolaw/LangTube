import { NextResponse } from "next/server";
import { resolveMediaClient } from "@/lib/media-resolver";
import { resolveWithYtDlp } from "@/lib/media-resolver-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const client = resolveMediaClient({ mode: "local", provider: "local", url }, url);
  if (client.type === "embed") {
    return NextResponse.json(client);
  }

  const ytdlp = await resolveWithYtDlp(url);
  if (ytdlp) {
    return NextResponse.json(ytdlp);
  }

  return NextResponse.json({
    type: "external",
    sourceUrl: url,
    url,
  });
}
