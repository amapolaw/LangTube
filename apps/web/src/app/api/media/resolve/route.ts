import { NextResponse } from "next/server";
import { resolveMediaClient } from "@/lib/media-resolver";
import { resolveRemoteMedia } from "@/lib/media-resolver-server";

export const runtime = "nodejs";

/**
 * 将页面链接解析为可播放直链（B站走官方 API + 代理；其他走 yt-dlp）。
 * GET /api/media/resolve?url=...
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  // 本地 path / 已是直链文件时，客户端 resolve 即可；这里专注远程页链接
  const remote = await resolveRemoteMedia(url);
  if (remote) {
    return NextResponse.json(remote);
  }

  const client = resolveMediaClient(
    { mode: "local", provider: "local", url },
    url
  );
  return NextResponse.json(client);
}
