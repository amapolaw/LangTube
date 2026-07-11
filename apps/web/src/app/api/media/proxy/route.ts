import { NextResponse } from "next/server";
import { isBilibiliCdnHost } from "@/lib/bilibili-media";

export const runtime = "nodejs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * 代理远程媒体（主要为 B站 CDN），转发 Range 以支持跟读 seek。
 * GET /api/media/proxy?target=...&referer=...
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("target");
  const referer =
    searchParams.get("referer") || "https://www.bilibili.com/";

  if (!target) {
    return NextResponse.json({ error: "target required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "invalid target" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "invalid protocol" }, { status: 400 });
  }

  // 仅允许已知媒体 CDN，避免开放代理滥用
  if (
    !isBilibiliCdnHost(parsed.hostname) &&
    !parsed.hostname.includes("googlevideo.com") &&
    !parsed.hostname.includes("ytimg.com")
  ) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  const range = req.headers.get("range");
  const upstreamHeaders: HeadersInit = {
    "User-Agent": UA,
    Referer: referer,
    Origin: "https://www.bilibili.com",
  };
  if (range) upstreamHeaders["Range"] = range;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: upstreamHeaders,
      redirect: "follow",
    });
  } catch (err) {
    console.error("[media/proxy]", err);
    return NextResponse.json(
      { error: "upstream fetch failed" },
      { status: 502 }
    );
  }

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: `upstream ${upstream.status}` },
      { status: upstream.status }
    );
  }

  const headers = new Headers();
  const pass = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ];
  for (const key of pass) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (!headers.has("accept-ranges")) {
    headers.set("Accept-Ranges", "bytes");
  }
  headers.set("Cache-Control", "private, max-age=300");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
