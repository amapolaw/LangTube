import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

const FFMPEG =
  process.env.FFMPEG_PATH?.trim() ||
  (fs.existsSync("/opt/homebrew/bin/ffmpeg")
    ? "/opt/homebrew/bin/ffmpeg"
    : "ffmpeg");

const converting = new Map<string, Promise<string>>();

/** 浏览器可播 MP4 路径（与 ensureBrowserPlayable 一致） */
export function browserMp4Path(inputPath: string): string {
  const dir = path.dirname(inputPath);
  return path.join(dir, `${safeBaseName(inputPath)}.browser.mp4`);
}

function safeBaseName(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  return base
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._\u4e00-\u9fff-]/g, "_")
    .slice(0, 80);
}

/** 浏览器难播的容器/编码（HEVC MOV 等） */
export function needsBrowserTranscode(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return [".mov", ".mkv", ".avi", ".m4v"].includes(ext);
}

/**
 * 确保返回浏览器可播的 H.264/AAC mp4。
 * 已有 .browser.mp4 则直接用；转换串行去重。
 */
export async function ensureBrowserPlayable(
  filePath: string
): Promise<{ path: string; converting: boolean; message?: string }> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`媒体文件不存在: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4" || ext === ".webm" || ext === ".mp3" || ext === ".m4a") {
    return { path: filePath, converting: false };
  }

  const outPath = browserMp4Path(filePath);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
    return { path: outPath, converting: false };
  }

  if (!needsBrowserTranscode(filePath)) {
    return { path: filePath, converting: false };
  }

  let job = converting.get(filePath);
  if (!job) {
    job = (async () => {
      const tmp = path.join(
        path.dirname(outPath),
        `.${safeBaseName(filePath)}.transcode.mp4`
      );
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        await execFileAsync(
          FFMPEG,
          [
            "-y",
            "-i",
            filePath,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            "-f",
            "mp4",
            tmp,
          ],
          { timeout: 30 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 }
        );
        fs.renameSync(tmp, outPath);
        return outPath;
      } catch (err) {
        try {
          if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        } catch {
          /* ignore */
        }
        throw err;
      } finally {
        converting.delete(filePath);
      }
    })();
    converting.set(filePath, job);
  }

  // 等待转换完成（听辨页首次打开可能较慢）
  const ready = await job;
  return {
    path: ready,
    converting: false,
    message: "已转码为浏览器可播 MP4",
  };
}
