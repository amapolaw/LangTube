import type { TranscriptLine } from "@langtube/core";
import { parseBilibiliUrl } from "./media-resolver";

export async function fetchSubtitlesFromUrl(
  url: string
): Promise<TranscriptLine[]> {
  const bili = parseBilibiliUrl(url);
  if (bili) {
    const lines = await fetchBilibiliSubtitles(bili.bvid, bili.page);
    if (lines.length) return lines;
  }

  const ytdlpLines = await fetchSubtitlesWithYtDlp(url);
  if (ytdlpLines.length) return ytdlpLines;

  return [];
}

async function fetchBilibiliSubtitles(
  bvid: string,
  page: number
): Promise<TranscriptLine[]> {
  try {
    const viewRes = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!viewRes.ok) return [];
    const viewData = (await viewRes.json()) as {
      data?: { pages?: { cid: number }[]; title?: string };
    };
    const cid = viewData.data?.pages?.[page - 1]?.cid;
    if (!cid) return [];

    const playerRes = await fetch(
      `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!playerRes.ok) return [];
    const playerData = (await playerRes.json()) as {
      data?: {
        subtitle?: {
          subtitles?: { subtitle_url: string; lan_doc: string }[];
        };
      };
    };
    const subs = playerData.data?.subtitle?.subtitles;
    if (!subs?.length) return [];

    const subUrl = subs[0].subtitle_url.startsWith("//")
      ? `https:${subs[0].subtitle_url}`
      : subs[0].subtitle_url;
    const subRes = await fetch(subUrl);
    if (!subRes.ok) return [];
    const subJson = (await subRes.json()) as {
      body?: { from: number; to: number; content: string }[];
    };

    return (subJson.body ?? []).map((item, i) => ({
      id: `line-${i + 1}`,
      start: item.from,
      end: item.to,
      text: item.content,
      translation: "",
    }));
  } catch {
    return [];
  }
}

async function fetchSubtitlesWithYtDlp(url: string): Promise<TranscriptLine[]> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync(
      "yt-dlp",
      ["--skip-download", "--write-auto-sub", "--sub-lang", "ja,en,zh", "-o", "-", "--print", "%(subtitles)s", url],
      { timeout: 45000 }
    );
    if (!stdout.trim()) return [];
    // yt-dlp subtitle dump varies; return empty if not parseable
    return [];
  } catch {
    return [];
  }
}
