import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import type { ResolvedMedia } from "@langtube/core";
import {
  bilibiliReferer,
  resolveBilibiliPlayUrl,
} from "@/lib/bilibili-media";
import { parseBilibiliUrl } from "@/lib/media-resolver";
import { getPlatformSession, getYtDlpAuthAttempts } from "@/lib/platform-session";

const execFileAsync = promisify(execFile);

const YTDLP_CANDIDATES = [
  process.env.YTDLP_PATH,
  "yt-dlp",
  "/opt/homebrew/bin/yt-dlp",
  "/usr/local/bin/yt-dlp",
  path.join(os.homedir(), ".local/bin/yt-dlp"),
].filter(Boolean) as string[];

function resolveYtDlp(): string | null {
  for (const candidate of YTDLP_CANDIDATES) {
    if (candidate === "yt-dlp") return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function ytdlpEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
    "ALL_PROXY",
    "all_proxy",
  ]) {
    delete env[key];
  }
  env.NO_PROXY = "*";
  env.no_proxy = "*";
  const extras = ["/opt/homebrew/bin", "/usr/local/bin"];
  const pathParts = (env.PATH ?? "").split(path.delimiter);
  for (const p of extras) {
    if (!pathParts.includes(p)) pathParts.unshift(p);
  }
  env.PATH = pathParts.join(path.delimiter);
  return env;
}

/** 浏览器可播的代理直链（带 B站 Referer） */
export function toProxiedMediaUrl(cdnUrl: string, referer: string): string {
  const params = new URLSearchParams({
    target: cdnUrl,
    referer,
  });
  return `/api/media/proxy?${params.toString()}`;
}

export async function resolveWithYtDlp(
  url: string
): Promise<ResolvedMedia | null> {
  const ytdlp = resolveYtDlp();
  if (!ytdlp) return null;

  const authAttempts = await getYtDlpAuthAttempts(url);
  const formatArgs = ["-g", "--no-playlist", "-f", "b/bv*+ba/best"];

  for (const authArgs of [...authAttempts, []]) {
    try {
      const { stdout } = await execFileAsync(
        ytdlp,
        [...formatArgs, ...authArgs, url],
        {
          timeout: 90000,
          env: ytdlpEnv(),
          maxBuffer: 2 * 1024 * 1024,
        }
      );
      const lines = stdout
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const directUrl = lines[0];
      if (!directUrl) continue;
      return { type: "direct", url: directUrl, sourceUrl: url };
    } catch {
      // try next auth method
    }
  }

  return null;
}

/**
 * 将远程页链接解析为可在本站 <video> 播放的直链。
 * B站：官方 playurl + 本地代理；其他：yt-dlp。
 */
export async function resolveRemoteMedia(
  url: string
): Promise<ResolvedMedia | null> {
  const bili = parseBilibiliUrl(url);
  if (bili) {
    try {
      const session = await getPlatformSession(url);
      const play = await resolveBilibiliPlayUrl(url, session.bilibiliCookie);
      if (play?.url) {
        return {
          type: "direct",
          url: toProxiedMediaUrl(play.url, bilibiliReferer(play.bvid)),
          sourceUrl: url,
        };
      }
    } catch (err) {
      console.warn("[resolveRemoteMedia] bilibili failed:", err);
    }
  }

  const ytdlp = await resolveWithYtDlp(url);
  if (ytdlp?.url) {
    // YouTube 等 CDN 也可能需代理；先返回直链，失败再由前端提示下载本地
    return ytdlp;
  }

  return null;
}
