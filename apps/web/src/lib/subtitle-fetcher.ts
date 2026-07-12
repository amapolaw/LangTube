import type { TranscriptLine } from "@langtube/core";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import { parseBilibiliUrl } from "./media-resolver";
import { BILIBILI_ORIGINAL_AUDIO_HINT } from "@/lib/parse-deps";
import { parseSrt } from "./subtitle-extractor";
import {
  bilibiliFetchHeaders,
  getPlatformSession,
  getYtDlpAuthAttempts,
} from "./platform-session";

const execFileAsync = promisify(execFile);

export interface SubtitleFetchResult {
  lines: TranscriptLine[];
  message: string;
}

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
    if (fsSync.existsSync(candidate)) return candidate;
  }
  return null;
}

/** 清除代理，避免 Cursor/系统代理导致 YouTube 403 */
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
  // 确保 Homebrew 路径在 PATH 中（Next.js 子进程常缺）
  const extras = ["/opt/homebrew/bin", "/usr/local/bin"];
  const pathParts = (env.PATH ?? "").split(path.delimiter);
  for (const p of extras) {
    if (!pathParts.includes(p)) pathParts.unshift(p);
  }
  env.PATH = pathParts.join(path.delimiter);
  return env;
}

export async function fetchSubtitlesFromUrl(
  url: string,
  preferredLang = "en",
  nativeLang = "zh"
): Promise<TranscriptLine[]> {
  const result = await fetchSubtitlesFromUrlDetailed(
    url,
    preferredLang,
    nativeLang
  );
  return result.lines;
}

export async function fetchSubtitlesFromUrlDetailed(
  url: string,
  preferredLang = "en",
  nativeLang = "zh"
): Promise<SubtitleFetchResult> {
  const bili = parseBilibiliUrl(url);
  if (bili) {
    const session = await getPlatformSession(url);
    const lines = await fetchBilibiliSubtitles(
      bili.bvid,
      bili.page,
      session.bilibiliCookie,
      preferredLang,
      nativeLang
    );
    if (lines.length) {
      return {
        lines,
        message: `已从 B站拉取字幕（${lines.length} 句）`,
      };
    }
    // 登录字幕或软字幕：回退 yt-dlp + Cookie
    if (session.bilibiliCookie || session.ytdlpBrowser || session.baiduCookie) {
      const ytdlp = resolveYtDlp();
      if (ytdlp) {
        const ytdlpResult = await fetchSubtitlesWithYtDlp(
          ytdlp,
          url,
          preferredLang,
          nativeLang
        );
        if (ytdlpResult.lines.length) return ytdlpResult;
      }
    }
  }

  const ytdlp = resolveYtDlp();
  if (!ytdlp) {
    return {
      lines: [],
      message:
        process.platform === "win32"
          ? "未找到 yt-dlp。请安装：winget install yt-dlp，或在资源页粘贴字幕"
          : "未找到 yt-dlp。请安装：brew install yt-dlp，或在资源页粘贴字幕",
    };
  }

  const ytdlpResult = await fetchSubtitlesWithYtDlp(
    ytdlp,
    url,
    preferredLang,
    nativeLang
  );
  if (ytdlpResult.lines.length) return ytdlpResult;

  return {
    lines: [],
    message:
      ytdlpResult.message ||
      "无法从链接获取字幕。请在设置页填写 B站 Cookie 或连接百度网盘，也可在资源页手动粘贴字幕",
  };
}

async function fetchBilibiliSubtitles(
  bvid: string,
  page: number,
  cookie?: string,
  sourceLang = "ja",
  nativeLang = "zh"
): Promise<TranscriptLine[]> {
  try {
    const headers = bilibiliFetchHeaders(bvid, cookie);
    const viewRes = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      { headers }
    );
    if (!viewRes.ok) return [];
    const viewData = (await viewRes.json()) as {
      data?: { pages?: { cid: number }[]; title?: string };
    };
    const cid = viewData.data?.pages?.[page - 1]?.cid;
    if (!cid) return [];

    const playerRes = await fetch(
      `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`,
      { headers }
    );
    let playerData = playerRes.ok
      ? ((await playerRes.json()) as {
          data?: {
            subtitle?: {
              subtitles?: {
                subtitle_url: string;
                lan_doc: string;
                lan?: string;
              }[];
            };
          };
        })
      : null;

    if (!playerData?.data?.subtitle?.subtitles?.length) {
      const wbiRes = await fetch(
        `https://api.bilibili.com/x/player/wbi/v2?bvid=${bvid}&cid=${cid}`,
        { headers }
      );
      if (wbiRes.ok) {
        playerData = (await wbiRes.json()) as typeof playerData;
      }
    }
    const subs = playerData?.data?.subtitle?.subtitles;
    if (!subs?.length) {
      console.warn(`[bilibili-subs] ${bvid} p${page}: 无字幕轨（需登录 Cookie）`);
      return [];
    }

    const nativeTrack = pickBilibiliSubtitleForLang(subs, nativeLang, {
      allowAi: true,
    });
    const nativeBody =
      nativeTrack && nativeTrack.subtitle_url
        ? await fetchBilibiliSubtitleBody(nativeTrack, cookie)
        : [];

    const sourceTrack = pickBilibiliSubtitleForLang(subs, sourceLang);
    if (sourceTrack?.subtitle_url) {
      const sourceBody = await fetchBilibiliSubtitleBody(sourceTrack, cookie);
      if (sourceBody.length) {
        const lines = mergeBilibiliSubtitleBodies(sourceBody, nativeBody);
        if (lines.length && subtitleMatchesSourceLang(lines, sourceLang)) {
          return lines;
        }
      }
    }

    // 回退：逐轨尝试，选取内容匹配 sourceLang 的轨道
    for (const track of subs) {
      if (!track.subtitle_url || track === nativeTrack) continue;
      const body = await fetchBilibiliSubtitleBody(track, cookie);
      if (!body.length) continue;
      const lines = mergeBilibiliSubtitleBodies(body, nativeBody);
      if (lines.length && subtitleMatchesSourceLang(lines, sourceLang)) {
        console.info(
          `[bilibili-subs] 使用轨道 ${track.lan ?? track.lan_doc} 作为 ${sourceLang} 字幕`
        );
        return lines;
      }
    }

    console.warn(
      `[bilibili-subs] 可用轨道: ${subs.map((s) => s.lan ?? s.lan_doc).join(", ")}`
    );
    if (subs.length > 0) {
      console.warn(`[bilibili-subs] 无 ${sourceLang} 字幕轨；${BILIBILI_ORIGINAL_AUDIO_HINT}`);
    }
    return [];
  } catch {
    return [];
  }
}

export async function fetchBilibiliZhTranslations(
  url: string
): Promise<{ from: number; to: number; content: string }[]> {
  const bili = parseBilibiliUrl(url);
  if (!bili) return [];
  const session = await getPlatformSession(url);
  try {
    const headers = bilibiliFetchHeaders(bili.bvid, session.bilibiliCookie);
    const viewRes = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bili.bvid}`,
      { headers }
    );
    if (!viewRes.ok) return [];
    const viewData = (await viewRes.json()) as {
      data?: { pages?: { cid: number }[] };
    };
    const cid = viewData.data?.pages?.[bili.page - 1]?.cid;
    if (!cid) return [];

    const playerRes = await fetch(
      `https://api.bilibili.com/x/player/v2?bvid=${bili.bvid}&cid=${cid}`,
      { headers }
    );
    if (!playerRes.ok) return [];
    const playerData = (await playerRes.json()) as {
      data?: {
        subtitle?: {
          subtitles?: {
            subtitle_url: string;
            lan?: string;
            lan_doc?: string;
          }[];
        };
      };
    };
    const subs = playerData.data?.subtitle?.subtitles ?? [];
    const zhTrack = pickBilibiliSubtitleForLang(subs, "zh", { allowAi: true });
    if (!zhTrack?.subtitle_url) return [];
    return fetchBilibiliSubtitleBody(zhTrack, session.bilibiliCookie);
  } catch {
    return [];
  }
}

function applyZhTranslationsToLines(
  lines: TranscriptLine[],
  zhBody: { from: number; to: number; content: string }[]
): void {
  if (!zhBody.length) return;
  for (const line of lines) {
    if (line.translation?.trim()) continue;
    const zh = findClosestSubtitle(zhBody, line.start, line.end);
    if (zh) line.translation = zh.trim();
  }
}

export function mergeZhTranslationsIntoLines(
  lines: TranscriptLine[],
  zhBody: { from: number; to: number; content: string }[]
): void {
  applyZhTranslationsToLines(lines, zhBody);
}

async function fetchBilibiliSubtitleBody(
  track: { subtitle_url: string },
  cookie?: string
): Promise<{ from: number; to: number; content: string }[]> {
  const subUrl = track.subtitle_url.startsWith("//")
    ? `https:${track.subtitle_url}`
    : track.subtitle_url;
  const subRes = await fetch(subUrl, {
    headers: cookie ? { Cookie: cookie } : undefined,
  });
  if (!subRes.ok) return [];
  const subJson = (await subRes.json()) as {
    body?: { from: number; to: number; content: string }[];
  };
  return subJson.body ?? [];
}

function mergeBilibiliSubtitleBodies(
  sourceBody: { from: number; to: number; content: string }[],
  nativeBody: { from: number; to: number; content: string }[]
): TranscriptLine[] {
  return sourceBody.map((item, i) => {
    const translation = findClosestSubtitle(nativeBody, item.from, item.to);
    return {
      id: `line-${i + 1}`,
      start: item.from,
      end: item.to,
      text: item.content.trim(),
      translation: translation?.trim() ?? "",
    };
  });
}

function findClosestSubtitle(
  body: { from: number; to: number; content: string }[],
  start: number,
  end: number
): string {
  if (!body.length) return "";
  const mid = (start + end) / 2;
  let best = body[0];
  let bestDist = Math.abs((best.from + best.to) / 2 - mid);
  for (const item of body) {
    const dist = Math.abs((item.from + item.to) / 2 - mid);
    if (dist < bestDist) {
      best = item;
      bestDist = dist;
    }
  }
  if (bestDist > 2.5) return "";
  return best.content;
}

function langCodes(lang: string, allowAi = false): string[] {
  const map: Record<string, string[]> = {
    ja: ["ja", "ja-JP", "ai-ja"],
    en: ["en", "en-US", "en-GB"],
    es: ["es", "es-ES", "es-419"],
    zh: ["zh", "zh-CN", "zh-Hans", "ai-zh"],
    fr: ["fr", "fr-FR"],
    de: ["de", "de-DE"],
    ko: ["ko", "ko-KR"],
  };
  const codes = map[lang] ?? [lang];
  if (allowAi && lang === "zh" && !codes.includes("ai-zh")) {
    return [...codes, "ai-zh"];
  }
  return codes;
}

function pickBilibiliSubtitleForLang(
  subs: { subtitle_url: string; lan_doc?: string; lan?: string }[],
  lang: string,
  opts?: { allowAi?: boolean }
): { subtitle_url: string; lan_doc?: string; lan?: string } | null {
  for (const code of langCodes(lang, opts?.allowAi)) {
    const hit = subs.find((s) => s.lan === code);
    if (hit) return hit;
  }

  const docHints: Record<string, RegExp> = {
    ja: /日语|日文|日字|日本語/,
    en: /英语|英文|English/i,
    es: /西语|西班牙|Spanish/i,
    zh: /中文|简体|繁體|字幕|Chinese/i,
  };
  const hint = docHints[lang];
  if (hint) {
    const hit = subs.find((s) => hint.test(s.lan_doc ?? ""));
    if (hit) return hit;
  }
  return null;
}

export function transcriptMatchesSourceLang(
  lines: TranscriptLine[],
  sourceLang: string
): boolean {
  return subtitleMatchesSourceLang(lines, sourceLang);
}

function subtitleMatchesSourceLang(
  lines: TranscriptLine[],
  sourceLang: string
): boolean {
  const sample = lines.slice(0, Math.min(8, lines.length));
  if (!sample.length) return false;
  const hits = sample.filter((l) =>
    lineMatchesLang(l.text, sourceLang)
  ).length;
  return hits >= Math.ceil(sample.length * 0.5);
}

function lineMatchesLang(text: string, lang: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (lang === "ja") {
    if (/[\u3040-\u30ff]/.test(t)) return true;
    if (/[\u4e00-\u9fff]/.test(t) && !looksChineseDominant(t)) return true;
    return false;
  }
  if (lang === "zh") return looksChineseDominant(t) || /[\u4e00-\u9fff]/.test(t);
  if (lang === "en") return /[a-zA-Z]{2,}/.test(t);
  if (lang === "es") return /[a-zA-Záéíóúñü]{2,}/i.test(t);
  return true;
}

function looksChineseDominant(text: string): boolean {
  if (/[\u3040-\u30ff]/.test(text)) return false;
  return /[的了是在有不这他那吗呢吧啊哎哦呀]/.test(text);
}

function summarizeYtDlpError(stderr: string): string {
  const text = stderr.slice(-1500);
  if (/Sign in to confirm|not a bot|cookies/i.test(text)) {
    return "YouTube 要求登录验证。请在 .env.local 设置 YTDLP_COOKIES_FROM_BROWSER=chrome（或 safari/edge），或在资源页手动粘贴字幕";
  }
  if (/ProxyError|Unable to connect to proxy|403 Forbidden/i.test(text)) {
    return "网络代理拦截了 YouTube 请求。已尝试绕过代理；若仍失败请关闭系统代理后重试，或手动粘贴字幕";
  }
  if (/Unsupported URL|No video/i.test(text)) {
    return "链接不受支持或视频不可用，请检查 URL 或手动粘贴字幕";
  }
  if (/No subtitles|Requested formats are unavailable/i.test(text)) {
    return "该视频没有可用字幕。请手动粘贴字幕，或对本地文件使用 whisper 转写";
  }
  const lastLine =
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .pop() ?? "yt-dlp 拉取失败";
  return `字幕拉取失败：${lastLine.slice(0, 200)}。可在资源页手动粘贴字幕`;
}

async function fetchSubtitlesWithYtDlp(
  ytdlpBin: string,
  url: string,
  preferredLang: string,
  nativeLang = "zh"
): Promise<SubtitleFetchResult> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "langtube-subs-"));
  const outputTemplate = path.join(tmpDir, "subs");
  const env = ytdlpEnv();

  const subLangs = [
    "ai-ja",
    "ai-zh",
    "ai-en",
    preferredLang,
    "en",
    "ja",
    "es",
    "fr",
    "zh",
    "zh-Hans",
    "zh-Hant",
  ].join(",");

  const baseArgs = [
    "--skip-download",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    subLangs,
    "--convert-subs",
    "srt",
    "--proxy",
    "",
    "-o",
    outputTemplate,
    url,
  ];

  const authAttempts = await getYtDlpAuthAttempts(url);
  const attempts: string[][] = [];
  for (const authArgs of authAttempts) {
    attempts.push([...authArgs, ...baseArgs]);
  }
  attempts.push(baseArgs);

  let lastError = "";

  try {
    for (const args of attempts) {
      try {
        await execFileAsync(ytdlpBin, args, {
          timeout: 180000,
          env,
          maxBuffer: 10 * 1024 * 1024,
        });

        const files = await fs.readdir(tmpDir);
        const srtFiles = files.filter((f) => f.endsWith(".srt"));
        let sourceFile = pickYtDlpSubtitleFile(srtFiles, preferredLang);
        let sourceLines: TranscriptLine[] = [];
        let nativeFile =
          nativeLang !== preferredLang
            ? pickYtDlpSubtitleFile(srtFiles, nativeLang, { allowAi: true })
            : undefined;

        if (sourceFile) {
          sourceLines = parseSrt(
            await fs.readFile(path.join(tmpDir, sourceFile), "utf-8")
          );
        }

        if (
          !sourceLines.length ||
          !subtitleMatchesSourceLang(sourceLines, preferredLang)
        ) {
          for (const file of srtFiles) {
            const candidate = parseSrt(
              await fs.readFile(path.join(tmpDir, file), "utf-8")
            );
            if (
              candidate.length &&
              subtitleMatchesSourceLang(candidate, preferredLang)
            ) {
              sourceLines = candidate;
              sourceFile = file;
              break;
            }
          }
        }

        if (!sourceLines.length) {
          lastError = `yt-dlp 写出 ${srtFiles.length} 个字幕文件，但无 ${preferredLang} 内容`;
          continue;
        }

        if (!nativeFile || nativeFile === sourceFile) {
          nativeFile = pickYtDlpSubtitleFile(srtFiles, nativeLang, {
            allowAi: true,
          });
        }
        if (nativeFile && nativeFile !== sourceFile) {
          const nativeLines = parseSrt(
            await fs.readFile(path.join(tmpDir, nativeFile), "utf-8")
          );
          for (const [i, line] of sourceLines.entries()) {
            const hit = nativeLines[i];
            if (hit && Math.abs(hit.start - line.start) < 1.5) {
              line.translation = hit.text;
            }
          }
        }

        return {
          lines: sourceLines,
          message: `已用 yt-dlp 拉取字幕（${sourceLines.length} 句，${preferredLang}${nativeFile ? "+" + nativeLang : ""}）`,
        };
      } catch (err) {
        const e = err as { stderr?: string; message?: string };
        lastError = summarizeYtDlpError(
          e.stderr ?? e.message ?? String(err)
        );
      }
    }

    return { lines: [], message: lastError };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function pickYtDlpSubtitleFile(
  files: string[],
  lang: string,
  opts?: { allowAi?: boolean }
): string | undefined {
  const patterns: Record<string, RegExp[]> = {
    ja: [/\.ja\.|japanese|jpn|ai-ja|\.ja-/i, /日/],
    en: [/\.en\.|english/i],
    es: [/\.es\.|spanish/i],
    zh: [/ai-zh|\.zh\.|chinese|\.zh-/i],
    fr: [/\.fr\.|french/i],
    de: [/\.de\.|german/i],
    ko: [/\.ko\.|korean/i],
  };
  const checks = [...(patterns[lang] ?? []), new RegExp(`\\.${lang}\\.`, "i")];
  if (opts?.allowAi && lang === "zh") {
    checks.unshift(/ai-zh/i);
  }
  for (const re of checks) {
    const hit = files.find((f) => re.test(f));
    if (hit) return hit;
  }
  return files.find((f) => f.includes(`.${lang}.`));
}
