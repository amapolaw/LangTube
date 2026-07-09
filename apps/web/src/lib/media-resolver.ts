import type { ResolvedMedia, StorageConfig } from "@langtube/core";
export function resolveMediaClient(
  storage: StorageConfig,
  sourceUrl?: string
): ResolvedMedia {
  const url = storage.url ?? sourceUrl ?? "";

  if (storage.path) {
    return {
      type: "direct",
      url: `/api/media?path=${encodeURIComponent(storage.path)}`,
    };
  }

  const bili = parseBilibiliUrl(url);
  if (bili) {
    const params = new URLSearchParams({
      bvid: bili.bvid,
      page: String(bili.page),
      high_quality: "1",
      danmaku: "0",
    });
    return {
      type: "embed",
      embedSrc: `https://player.bilibili.com/player.html?${params}`,
      sourceUrl: url,
    };
  }

  const yt = parseYouTubeUrl(url);
  if (yt) {
    return {
      type: "embed",
      embedSrc: `https://www.youtube.com/embed/${yt}`,
      sourceUrl: url,
    };
  }

  if (url) {
    return { type: "external", sourceUrl: url, url };
  }

  return { type: "external" };
}

export function parseBilibiliUrl(url: string): { bvid: string; page: number } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("bilibili.com")) return null;
    const bvid = u.pathname.match(/\/video\/(BV[\w]+)/i)?.[1];
    if (!bvid) return null;
    const page = parseInt(u.searchParams.get("p") ?? "1", 10);
    return { bvid, page: Number.isNaN(page) ? 1 : page };
  } catch {
    return null;
  }
}

export function parseYouTubeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1) || null;
    }
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v");
    }
    return null;
  } catch {
    return null;
  }
}
