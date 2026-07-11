import { parseBilibiliUrl } from "@/lib/media-resolver";
import { bilibiliFetchHeaders } from "@/lib/platform-session";

export type BilibiliPlayUrl = {
  bvid: string;
  page: number;
  cid: number;
  title: string;
  partTitle: string;
  /** CDN 直链（需带 Referer 才能播） */
  url: string;
  size?: number;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function bilibiliReferer(bvid?: string): string {
  return bvid
    ? `https://www.bilibili.com/video/${bvid}/`
    : "https://www.bilibili.com/";
}

/** 通过 B站官方 API 解析可播放直链（绕过 yt-dlp 412） */
export async function resolveBilibiliPlayUrl(
  sourceUrl: string,
  cookie?: string
): Promise<BilibiliPlayUrl | null> {
  const parsed = parseBilibiliUrl(sourceUrl);
  if (!parsed) return null;

  const headers = bilibiliFetchHeaders(parsed.bvid, cookie);

  const viewRes = await fetch(
    `https://api.bilibili.com/x/web-interface/view?bvid=${parsed.bvid}`,
    { headers }
  );
  if (!viewRes.ok) return null;
  const viewData = (await viewRes.json()) as {
    code?: number;
    data?: {
      title?: string;
      pages?: { cid: number; part?: string; duration?: number }[];
    };
  };
  if (viewData.code !== 0 || !viewData.data?.pages?.length) return null;

  const pageIndex = Math.min(
    Math.max(parsed.page, 1),
    viewData.data.pages.length
  );
  const pageInfo = viewData.data.pages[pageIndex - 1];
  if (!pageInfo?.cid) return null;

  // fnval=1 → 单文件 MP4/FLV（便于 <video> 与跟读截取）
  const playRes = await fetch(
    `https://api.bilibili.com/x/player/playurl?bvid=${parsed.bvid}&cid=${pageInfo.cid}&qn=64&fnval=1&fourk=1`,
    { headers }
  );
  if (!playRes.ok) return null;
  const playData = (await playRes.json()) as {
    code?: number;
    data?: { durl?: { url: string; size?: number }[] };
  };
  const durl = playData.data?.durl?.[0];
  if (!durl?.url) return null;

  return {
    bvid: parsed.bvid,
    page: pageIndex,
    cid: pageInfo.cid,
    title: viewData.data.title ?? parsed.bvid,
    partTitle: pageInfo.part ?? `P${pageIndex}`,
    url: durl.url,
    size: durl.size,
  };
}

export function isBilibiliCdnHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host.includes("bilivideo.com") ||
    host.includes("akamaized.net") ||
    host.includes("bilibili.com") ||
    host.endsWith(".bilivideo.cn")
  );
}
