import { execFile } from "child_process";
import { promisify } from "util";
import type { ResolvedMedia } from "@langtube/core";

const execFileAsync = promisify(execFile);

export async function resolveWithYtDlp(url: string): Promise<ResolvedMedia | null> {
  try {
    const { stdout } = await execFileAsync(
      "yt-dlp",
      ["-g", "--no-playlist", url],
      { timeout: 30000 }
    );
    const directUrl = stdout.trim().split("\n")[0];
    if (directUrl) {
      return { type: "direct", url: directUrl, sourceUrl: url };
    }
  } catch {
    /* yt-dlp not available */
  }
  return null;
}
