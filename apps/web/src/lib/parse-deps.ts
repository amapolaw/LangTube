import { execFile } from "child_process";
import { promisify } from "util";
import fsSync from "fs";
import { readSettings } from "@/lib/data";
import { hasPlatformLogin } from "@/lib/platform-session";

const execFileAsync = promisify(execFile);

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
  if (context === "url" && !deps.ytdlp) {
    hints.push(installHint("yt-dlp"));
  }
  if (context === "url" && !(await hasPlatformLogin(sourceUrl))) {
    hints.push(
      "B站/百度网盘：请在设置页填写 B站 Cookie、连接百度网盘，或设置 YTDLP_COOKIES_FROM_BROWSER=chrome"
    );
  }
  if (context === "local") {
    if (!deps.ffmpeg) hints.push(installHint("ffmpeg"));
    if (!deps.whisper) {
      hints.push(
        installHint("whisper") +
          "（B站仅有 ai-zh 轨时，需 Whisper 转写日语原声）"
      );
    }
  }
  if (!deps.llmConfigured) {
    hints.push(
      "请在 Cursor IDE 终端运行本应用（使用已登录会话），或配置 LLM_API_KEY"
    );
  }
  return hints.length ? hints.join("；") : "";
}
