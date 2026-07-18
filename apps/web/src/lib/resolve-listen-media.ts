import type { ContentPack, ResolvedMedia } from "@langtube/core";
import { mediaUrlForMaterial } from "@/lib/material-id";
import {
  isBaiduPanUrl,
  isRemoteVideoPageUrl,
  resolveMediaClient,
} from "@/lib/media-resolver";

/** 听辨页：解析可播放媒体（本地 / 下载远程 / 直链解析） */
export async function resolveListenPlaybackMedia(
  materialId: string,
  pack: Pick<ContentPack, "storage" | "manifest">
): Promise<{ media: ResolvedMedia; message?: string }> {
  const remoteUrl =
    pack.storage?.url?.trim() || pack.manifest?.sourceUrl?.trim() || "";
  const localUrl = mediaUrlForMaterial(materialId);

  if (pack.storage?.path) {
    const head = await fetch(localUrl, { method: "HEAD" }).catch(() => null);
    if (head?.ok) {
      return {
        media: {
          type: "direct",
          url: localUrl,
          sourceUrl: remoteUrl || undefined,
        },
        message:
          "本地视频加载中（MOV/HEVC 首次会自动转码为可播 MP4，请稍候）",
      };
    }
  }

  if (remoteUrl && isRemoteVideoPageUrl(remoteUrl)) {
    const shouldDownload =
      isBaiduPanUrl(remoteUrl) ||
      remoteUrl.includes("bilibili.com") ||
      remoteUrl.includes("youtube.com") ||
      remoteUrl.includes("youtu.be");

    if (shouldDownload) {
      try {
        const dl = await fetch(
          `/api/materials/${encodeURIComponent(materialId)}/ensure-media`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceUrl: remoteUrl }),
          }
        ).then((r) => r.json());

        if (dl.ok && dl.playbackUrl) {
          return {
            media: {
              type: "direct",
              url: dl.playbackUrl as string,
              sourceUrl: remoteUrl,
            },
            message: (dl.message as string) || "视频已就绪",
          };
        }
        if (dl.error) {
          const fallback = await tryMediaResolve(remoteUrl);
          if (fallback) {
            return {
              media: fallback,
              message: `${dl.error}；已尝试在线解析播放`,
            };
          }
          return {
            media: resolveMediaClient(
              pack.storage,
              pack.manifest?.sourceUrl,
              undefined
            ),
            message: dl.error as string,
          };
        }
      } catch {
        /* fall through */
      }
    }

    const resolved = await tryMediaResolve(remoteUrl);
    if (resolved) {
      return { media: resolved };
    }
  }

  return {
    media: resolveMediaClient(
      pack.storage,
      pack.manifest?.sourceUrl,
      pack.storage?.path ? materialId : undefined
    ),
  };
}

async function tryMediaResolve(
  remoteUrl: string
): Promise<ResolvedMedia | null> {
  try {
    const fallback = await fetch(
      `/api/media/resolve?url=${encodeURIComponent(remoteUrl)}`
    ).then((r) => r.json());
    if (fallback?.type === "direct" && fallback.url) {
      return fallback as ResolvedMedia;
    }
  } catch {
    /* ignore */
  }
  return null;
}
