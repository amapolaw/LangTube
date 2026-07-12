import type { TranscriptLine, SupportedLanguage } from "@langtube/core";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execFileAsync = promisify(execFile);

function parseTimestamp(h: string, m: string, s: string, ms: string): number {
  return (
    Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000
  );
}

export function parseSrt(content: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  const blocks = content.replace(/\r\n/g, "\n").trim().split(/\n\n+/);
  let idx = 1;

  for (const block of blocks) {
    const parts = block.split("\n");
    if (parts.length < 2) continue;
    const timeLine = parts.find((p) => p.includes("-->"));
    if (!timeLine) continue;
    const match = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!match) continue;
    const start = parseTimestamp(match[1], match[2], match[3], match[4]);
    const end = parseTimestamp(match[5], match[6], match[7], match[8]);
    const text = parts
      .slice(parts.indexOf(timeLine) + 1)
      .join("\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!text) continue;
    lines.push({ id: `line-${idx++}`, start, end, text, translation: "" });
  }
  return lines;
}

export function parseVtt(content: string): TranscriptLine[] {
  const withoutHeader = content.replace(/^WEBVTT[^\n]*\n+/i, "");
  return parseSrt(withoutHeader.replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, "$1,$2"));
}

async function hasSubtitleStream(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-select_streams",
        "s",
        "-show_entries",
        "stream=index",
        "-of",
        "csv=p=0",
        filePath,
      ],
      { timeout: 15000 }
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function extractEmbeddedSubtitles(
  filePath: string
): Promise<TranscriptLine[]> {
  if (!(await hasSubtitleStream(filePath))) return [];

  try {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      ["-i", filePath, "-map", "0:s:0", "-f", "srt", "pipe:1"],
      { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
    );
    return parseSrt(stdout);
  } catch {
    return [];
  }
}

async function findSidecarSubtitles(
  mediaDir: string,
  videoPath: string
): Promise<TranscriptLine[]> {
  const base = path.basename(videoPath, path.extname(videoPath));
  const candidates = [
    `${base}.srt`,
    `${base}.vtt`,
    `${base}.ja.srt`,
    `${base}.en.srt`,
    `${base}.es.srt`,
    `${base}.fr.srt`,
    "subtitles.srt",
    "subtitles.vtt",
  ];

  for (const name of candidates) {
    const subPath = path.join(mediaDir, name);
    try {
      const content = await fs.readFile(subPath, "utf-8");
      const lines =
        name.endsWith(".vtt") ? parseVtt(content) : parseSrt(content);
      if (lines.length) return lines;
    } catch {
      // try next candidate
    }
  }
  return [];
}

const WHISPER_LANG: Record<SupportedLanguage, string> = {
  ja: "ja",
  en: "en",
  es: "es",
  fr: "fr",
};

async function transcribeWithWhisper(
  filePath: string,
  lang: SupportedLanguage
): Promise<TranscriptLine[]> {
  try {
    const tmpDir = path.join(path.dirname(filePath), ".whisper-tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    await execFileAsync(
      "whisper",
      [
        filePath,
        "--language",
        WHISPER_LANG[lang] ?? "ja",
        "--output_format",
        "srt",
        "--output_dir",
        tmpDir,
      ],
      { timeout: 600000 }
    );
    const base = path.basename(filePath, path.extname(filePath));
    const srtPath = path.join(tmpDir, `${base}.srt`);
    const content = await fs.readFile(srtPath, "utf-8");
    await fs.rm(tmpDir, { recursive: true, force: true });
    return parseSrt(content);
  } catch {
    return [];
  }
}

export interface SubtitleExtractionResult {
  lines: TranscriptLine[];
  source: "embedded" | "sidecar" | "whisper" | "none";
  message: string;
}

export async function extractTextSubtitlesFromLocal(
  filePath: string
): Promise<SubtitleExtractionResult> {
  const mediaDir = path.dirname(filePath);

  const embedded = await extractEmbeddedSubtitles(filePath);
  if (embedded.length) {
    return {
      lines: embedded,
      source: "embedded",
      message: `已提取内嵌字幕（${embedded.length} 句）`,
    };
  }

  const sidecar = await findSidecarSubtitles(mediaDir, filePath);
  if (sidecar.length) {
    return {
      lines: sidecar,
      source: "sidecar",
      message: `已读取外挂字幕（${sidecar.length} 句）`,
    };
  }

  return {
    lines: [],
    source: "none",
    message: "未检测到内嵌或外挂字幕文件",
  };
}

export async function transcribeAudioSubtitles(
  filePath: string,
  lang: SupportedLanguage = "ja"
): Promise<SubtitleExtractionResult> {
  const whisper = await transcribeWithWhisper(filePath, lang);
  if (whisper.length) {
    return {
      lines: whisper,
      source: "whisper",
      message: `Whisper 语音转写完成（${whisper.length} 句）`,
    };
  }
  return {
    lines: [],
    source: "none",
    message:
      process.platform === "win32"
        ? "Whisper 转写失败。Windows 请执行：pip install openai-whisper，并安装 ffmpeg（winget install ffmpeg）"
        : "Whisper 转写失败，请安装 whisper：brew install whisper",
  };
}

export async function extractSubtitlesFromLocalFile(
  filePath: string,
  lang: SupportedLanguage = "ja"
): Promise<SubtitleExtractionResult> {
  const text = await extractTextSubtitlesFromLocal(filePath);
  if (text.lines.length) return text;
  return transcribeAudioSubtitles(filePath, lang);
}
