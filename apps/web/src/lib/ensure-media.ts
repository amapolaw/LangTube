import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ContentPack } from "@langtube/core";
import { readContentPack, saveContentPack, readIndex, writeIndex } from "@/lib/data";
import { getMaterialDir } from "@/lib/paths";
import {
  bilibiliReferer,
  resolveBilibiliPlayUrl,
} from "@/lib/bilibili-media";
import { parseBilibiliUrl } from "@/lib/media-resolver";
import { resolveWithYtDlp } from "@/lib/media-resolver-server";
import {
  getPlatformSession,
  getYtDlpAuthAttempts,
  isBaiduPanUrl,
} from "@/lib/platform-session";
import { mediaUrlForMaterial } from "@/lib/material-id";

const execFileAsync = promisify(execFile);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function downloadToFile(
  url: string,
  dest: string,
  referer?: string,
  cookie?: string
): Promise<void> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      ...(referer
        ? { Referer: referer, Origin: "https://www.bilibili.com" }
        : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: "follow",
  });
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status}`);
  }
  const tmp = `${dest}.part`;
  await pipeline(
    Readable.fromWeb(res.body as import("stream/web").ReadableStream),
    fs.createWriteStream(tmp)
  );
  fs.renameSync(tmp, dest);
}

const YTDLP_CANDIDATES = [
  process.env.YTDLP_PATH,
  "yt-dlp",
  "/opt/homebrew/bin/yt-dlp",
  "/usr/local/bin/yt-dlp",
].filter(Boolean) as string[];

function resolveYtDlpBin(): string | null {
  for (const c of YTDLP_CANDIDATES) {
    if (c === "yt-dlp") return c;
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function ytdlpExtraArgs(url: string): string[] {
  if (!isBaiduPanUrl(url)) return [];
  try {
    const pwd = new URL(url).searchParams.get("pwd");
    if (pwd) return ["--extractor-args", `pan.baidu:password=${pwd}`];
  } catch {
    /* ignore */
  }
  return [];
}

/** yt-dlp 下载完整 mp4（B站/百度分享链接兜底） */
async function downloadWithYtDlp(url: string, dest: string): Promise<boolean> {
  const ytdlp = resolveYtDlpBin();
  if (!ytdlp) return false;
  const attempts = await getYtDlpAuthAttempts(url);
  const extra = ytdlpExtraArgs(url);
  const tmp = `${dest}.ytdlp.mp4`;
  for (const authArgs of attempts) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      await execFileAsync(
        ytdlp,
        [
          ...authArgs,
          ...extra,
          "-f",
          "bv*+ba/b",
          "--merge-output-format",
          "mp4",
          "--no-playlist",
          "-o",
          tmp,
          url,
        ],
        { timeout: 600000, maxBuffer: 4 * 1024 * 1024 }
      );
      if (fs.existsSync(tmp)) {
        fs.renameSync(tmp, dest);
        return true;
      }
    } catch {
      // try next auth
    }
  }
  return false;
}

function platformErrorHint(
  url: string,
  session: Awaited<ReturnType<typeof getPlatformSession>>
): string {
  if (isBaiduPanUrl(url) && !session.baiduCookie) {
    return "百度网盘未连接。请在设置页「云存储」登录百度云盘后再导入分享链接";
  }
  if (parseBilibiliUrl(url) && !session.bilibiliCookie && !session.ytdlpBrowser) {
    return "B站未登录。请在设置页填写 B站 Cookie";
  }
  return "请确认 Cookie 未过期，或关闭 Chrome 后重试（yt-dlp 读取浏览器 Cookie 时 Chrome 不能独占数据库）";
}

/**
 * 将 B站/YouTube/网盘链接视频下载到本地 media/，供听辨/跟读播放。
 */
export async function ensureMaterialMediaDownload(
  materialId: string,
  sourceUrl?: string
): Promise<{
  ok: boolean;
  alreadyLocal?: boolean;
  path?: string;
  playbackUrl?: string;
  message?: string;
  error?: string;
}> {
  const pack = await readContentPack(materialId);
  if (!pack) {
    return { ok: false, error: "素材不存在" };
  }

  const url =
    sourceUrl?.trim() ||
    pack.manifest.sourceUrl?.trim() ||
    pack.storage.url?.trim() ||
    "";

  if (pack.storage.path && fs.existsSync(pack.storage.path)) {
    return {
      ok: true,
      alreadyLocal: true,
      path: pack.storage.path,
      playbackUrl: mediaUrlForMaterial(materialId),
      message: "本地视频已就绪",
    };
  }

  if (!url) {
    return {
      ok: false,
      error: "无视频链接。请在资源页粘贴 B站/百度网盘/YouTube URL，或上传本地视频。",
    };
  }

  const session = await getPlatformSession(url);
  const mediaDir = path.join(getMaterialDir(materialId), "media");
  fs.mkdirSync(mediaDir, { recursive: true });

  let filename = "video.mp4";
  let downloadUrl = "";
  let referer: string | undefined;
  let cookie: string | undefined;

  const bili = parseBilibiliUrl(url);
  if (bili) {
    const play = await resolveBilibiliPlayUrl(url, session.bilibiliCookie);
    if (play?.url) {
      filename = `${play.bvid}_p${play.page}.mp4`;
      downloadUrl = play.url;
      referer = bilibiliReferer(play.bvid);
      cookie = session.bilibiliCookie;
    }
  } else {
    const remote = await resolveWithYtDlp(url);
    if (remote?.url) {
      filename = `remote-${Date.now()}.mp4`;
      downloadUrl = remote.url;
    }
  }

  let dest = path.join(mediaDir, filename);
  let downloaded = false;

  if (downloadUrl) {
    try {
      await downloadToFile(downloadUrl, dest, referer, cookie);
      downloaded = true;
    } catch {
      downloaded = false;
    }
  }

  if (!downloaded) {
    if (bili) {
      filename = `${bili.bvid}_p${bili.page}.mp4`;
      dest = path.join(mediaDir, filename);
    }
    const ytOk = await downloadWithYtDlp(url, dest);
    if (!ytOk) {
      return {
        ok: false,
        error: `无法下载视频。${platformErrorHint(url, session)}`,
      };
    }
  }

  pack.storage = {
    mode: "local",
    provider: "local",
    path: dest,
    url,
  };
  pack.manifest.sourceUrl = url;
  pack.manifest.storage = pack.storage;
  pack.manifest.updatedAt = new Date().toISOString();
  await saveContentPack(pack);

  const index = await readIndex();
  const entry = index.materials.find((m) => m.id === materialId);
  if (entry) {
    entry.sourceUrl = url;
    entry.updatedAt = pack.manifest.updatedAt;
    await writeIndex(index);
  }

  return {
    ok: true,
    path: dest,
    playbackUrl: mediaUrlForMaterial(materialId),
    message: "视频已下载到本地，可播放并字幕跟随",
  };
}

export function packHasPlayableLocal(pack: ContentPack): boolean {
  return Boolean(pack.storage.path && fs.existsSync(pack.storage.path));
}
