import { NextResponse } from "next/server";
import { readContentPack, saveContentPack } from "@/lib/data";
import {
  applySubtitleTimeOffset,
  hasSyntheticUniformTiming,
  retimeBySpeechRate,
  mergeTimingsFromReference,
} from "@/lib/transcript-timing";
import { fetchSubtitlesFromUrlDetailed } from "@/lib/subtitle-fetcher";
import { parseBilibiliUrl } from "@/lib/media-resolver";
import { bilibiliFetchHeaders, getPlatformSession } from "@/lib/platform-session";

export const maxDuration = 120;

async function fetchBilibiliDurationSec(url: string): Promise<number | null> {
  const bili = parseBilibiliUrl(url);
  if (!bili) return null;
  try {
    const session = await getPlatformSession(url);
    const headers = bilibiliFetchHeaders(bili.bvid, session.bilibiliCookie);
    const viewRes = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bili.bvid}`,
      { headers }
    );
    if (!viewRes.ok) return null;
    const viewData = (await viewRes.json()) as {
      data?: { pages?: { duration?: number }[]; duration?: number };
    };
    const pageDur = viewData.data?.pages?.[bili.page - 1]?.duration;
    if (typeof pageDur === "number" && pageDur > 0) return pageDur;
    if (typeof viewData.data?.duration === "number") {
      return viewData.data.duration;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * POST /api/materials/[id]/realign-subtitles
 * 修复字幕与语音时间轴不对齐。
 *
 * body.mode:
 * - speech-rate: 按语速重排（修复等间隔假时间轴）
 * - offset: 整体平移秒数
 * - refetch: 从 sourceUrl 重新拉取带时间轴字幕
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pack = await readContentPack(id);
  if (!pack) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    mode?: "speech-rate" | "offset" | "refetch";
    offsetSec?: number;
    startOffsetSec?: number;
    targetDurationSec?: number;
    wordsPerSecond?: number;
  };

  const mode = body.mode ?? "speech-rate";
  const lines = pack.transcript.lines;
  if (!lines.length) {
    return NextResponse.json(
      { error: "无字幕可对齐", mode },
      { status: 400 }
    );
  }

  const synthetic = hasSyntheticUniformTiming(lines);
  const sourceUrl = pack.manifest.sourceUrl ?? pack.storage.url ?? "";

  if (mode === "refetch") {
    if (!sourceUrl) {
      return NextResponse.json(
        { error: "无 sourceUrl，无法重新拉取字幕" },
        { status: 400 }
      );
    }
    const fetched = await fetchSubtitlesFromUrlDetailed(
      sourceUrl,
      pack.manifest.sourceLang,
      pack.manifest.nativeLang
    );
    if (!fetched.lines.length) {
      return NextResponse.json(
        {
          ok: false,
          mode,
          synthetic,
          message:
            fetched.message ||
            "未能拉取带时间轴字幕。请上传 SRT，或使用「按语速重排」。",
        },
        { status: 422 }
      );
    }
    pack.transcript.lines = mergeTimingsFromReference(lines, fetched.lines).map(
      (l, i) => ({
        ...fetched.lines[Math.min(i, fetched.lines.length - 1)]!,
        // 优先保留远端真实时间轴文本；若数量一致则以远程为准
        text: fetched.lines.length === lines.length ? fetched.lines[i]!.text : l.text,
        translation: l.translation || "",
        id: `line-${i + 1}`,
      })
    );
    // 若远端字幕更可靠，直接用远端
    if (fetched.lines.length >= lines.length * 0.5) {
      pack.transcript.lines = fetched.lines.map((l, i) => ({
        ...l,
        id: `line-${i + 1}`,
        translation: l.translation || "",
      }));
    }
    pack.manifest.updatedAt = new Date().toISOString();
    const lastEnd =
      pack.transcript.lines[pack.transcript.lines.length - 1]?.end ?? 600;
    pack.manifest.segments = {
    extensive: [
      {
        start: 0,
        end: lastEnd,
        reason: "全片字幕跟随，适合泛听建立整体语境",
        durationMinutes: Math.max(1, Math.round(lastEnd / 60)),
      },
    ],
    intensive: [
      {
        start: Math.min(60, lastEnd * 0.05),
        end: lastEnd,
        reason: "按真实时间轴精听",
        durationMinutes: Math.max(1, Math.round(lastEnd / 60)),
      },
    ],
  };
    pack.segments = pack.manifest.segments;
    await saveContentPack(pack);
    return NextResponse.json({
      ok: true,
      mode,
      lines: pack.transcript.lines.length,
      duration: lastEnd,
      message: `已用链接字幕重对齐（${pack.transcript.lines.length} 行）`,
    });
  }

  if (mode === "offset") {
    const offsetSec = Number(body.offsetSec ?? 0);
    pack.transcript.lines = applySubtitleTimeOffset(lines, offsetSec);
    pack.manifest.updatedAt = new Date().toISOString();
    await saveContentPack(pack);
    return NextResponse.json({
      ok: true,
      mode,
      offsetSec,
      lines: pack.transcript.lines.length,
      message: `字幕时间轴已平移 ${offsetSec >= 0 ? "+" : ""}${offsetSec} 秒`,
    });
  }

  // speech-rate（默认）
  let targetDurationSec = body.targetDurationSec;
  if (!targetDurationSec && sourceUrl) {
    const biliDur = await fetchBilibiliDurationSec(sourceUrl);
    if (biliDur) targetDurationSec = biliDur;
  }
  if (!targetDurationSec) {
    // 回退：用现有末尾时间与估计的较大者
    const last = lines[lines.length - 1]?.end ?? 0;
    targetDurationSec = Math.max(last, lines.length * 3.5);
  }

  pack.transcript.lines = retimeBySpeechRate(lines, {
    lang: pack.manifest.sourceLang,
    wordsPerSecond: body.wordsPerSecond,
    targetDurationSec,
    startOffsetSec: body.startOffsetSec ?? 0,
  });
  const lastEnd =
    pack.transcript.lines[pack.transcript.lines.length - 1]?.end ??
    targetDurationSec;
  pack.manifest.segments = {
    extensive: [
      {
        start: 0,
        end: lastEnd,
        reason: "全片字幕跟随，适合泛听建立整体语境",
        durationMinutes: Math.max(1, Math.round(lastEnd / 60)),
      },
    ],
    intensive: [
      {
        start: Math.min(60, lastEnd * 0.05),
        end: lastEnd,
        reason: "按语速重排后的精听区间",
        durationMinutes: Math.max(1, Math.round(lastEnd / 60)),
      },
    ],
  };
  pack.segments = pack.manifest.segments;
  pack.manifest.updatedAt = new Date().toISOString();
  await saveContentPack(pack);

  return NextResponse.json({
    ok: true,
    mode: "speech-rate",
    synthetic,
    lines: pack.transcript.lines.length,
    duration: lastEnd,
    targetDurationSec,
    message: synthetic
      ? `检测到等间隔假时间轴，已按语速重排并对齐至约 ${Math.round(lastEnd / 60)} 分钟`
      : `已按语速重排时间轴（约 ${Math.round(lastEnd / 60)} 分钟）`,
  });
}
