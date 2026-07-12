import { execFile } from "child_process";
import { promisify } from "util";
import fsSync from "fs";
import { readSettings } from "@/lib/data";
import { hasPlatformLogin } from "@/lib/platform-session";
import { parseBilibiliUrl } from "@/lib/media-resolver";

const execFileAsync = promisify(execFile);

/** B站学习流程：原文来自视频原声转写，非 B站字幕轨 */
export const BILIBILI_ORIGINAL_AUDIO_HINT =
  "B站视频需 Whisper 转写视频原声作为学习语种字幕（原声语种与素材 sourceLang 一致，可为英/日/西/法等）；B站字幕轨（如 ai-zh）仅作中文对照";

export interface ParseDependencies {
  ytdlp: boolean;
  ffmpeg: boolean;
  whisper: boolean;
  llmConfigured: boolean;
}

/**
 * Cursor 会话模式默认可用（IDE 终端已登录），无需强制 CURSOR_API_KEY。
 * 显式 openai/anthropic 且无 Key 时仍视为未配置。
 */
export async function isLlmConfigured(): Promise<boolean> {
  const settings = await readSettings();
  const provider =
    settings.llmProvider ??
    (process.env.LLM_PROVIDER as string) ??
    "cursor";

  if (provider === "cursor" || !provider) {
    return true;
  }

  return Boolean(
    process.env.LLM_API_KEY?.trim() ||
      settings.llmApiKey?.trim() ||
      process.env.CURSOR_API_KEY?.trim() ||
      settings.cursorApiKey?.trim()
  );
}

export async function checkParseDependencies(): Promise<ParseDependencies> {
  const [ytdlp, ffmpeg, whisper, llmConfigured] = await Promise.all([
    commandExists("yt-dlp"),
    commandExists("ffmpeg"),
    commandExists("whisper"),
    isLlmConfigured(),
  ]);

  return { ytdlp, ffmpeg, whisper, llmConfigured };
}

async function commandExists(cmd: string): Promise<boolean> {
  const candidates =
    cmd === "yt-dlp"
      ? [
          process.env.YTDLP_PATH,
          "yt-dlp",
          "/opt/homebrew/bin/yt-dlp",
          "/usr/local/bin/yt-dlp",
        ].filter(Boolean)
      : [cmd];

  for (const candidate of candidates as string[]) {
    try {
      if (candidate.includes("/") || candidate.includes("\\")) {
        if (fsSync.existsSync(candidate)) return true;
        continue;
      }
      if (process.platform === "win32") {
        await execFileAsync("where", [candidate], { timeout: 3000 });
      } else {
        await execFileAsync("which", [candidate], { timeout: 3000 });
      }
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

function installHint(tool: "yt-dlp" | "ffmpeg" | "whisper"): string {
  if (process.platform === "win32") {
    switch (tool) {
      case "yt-dlp":
        return "安装 yt-dlp：winget install yt-dlp";
      case "ffmpeg":
        return "安装 ffmpeg：winget install ffmpeg";
      case "whisper":
        return "安装 whisper：pip install openai-whisper（本地视频语音转写）";
    }
  }
  switch (tool) {
    case "yt-dlp":
      return "安装 yt-dlp：brew install yt-dlp";
    case "ffmpeg":
      return "安装 ffmpeg：brew install ffmpeg";
    case "whisper":
      return "安装 whisper：brew install whisper（本地视频语音转写）";
  }
}

export async function formatMissingDependencyHints(
  deps: ParseDependencies,
  context: "url" | "local",
  sourceUrl?: string
): Promise<string> {
  const hints: string[] = [];
  const isBilibili = sourceUrl ? Boolean(parseBilibiliUrl(sourceUrl)) : false;

  if (context === "url" && !deps.ytdlp) {
    hints.push(installHint("yt-dlp"));
  }
  if (context === "url" && !(await hasPlatformLogin(sourceUrl))) {
    hints.push(
      "B站/百度网盘：请在设置页填写 B站 Cookie、连接百度网盘，或设置 YTDLP_COOKIES_FROM_BROWSER=chrome"
    );
  }

  const needsWhisperForAudio =
    context === "local" || isBilibili;

  if (needsWhisperForAudio) {
    if (!deps.ffmpeg) hints.push(installHint("ffmpeg"));
    if (!deps.whisper) {
      const suffix = isBilibili
        ? `（${BILIBILI_ORIGINAL_AUDIO_HINT}）`
        : "（本地视频语音转写）";
      hints.push(installHint("whisper") + suffix);
    }
  }

  if (!deps.llmConfigured) {
    hints.push(
      "请在 Cursor IDE 终端运行本应用（使用已登录会话），或配置 LLM_API_KEY"
    );
  }
  return hints.length ? hints.join("；") : "";
}
