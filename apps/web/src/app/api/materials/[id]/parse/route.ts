import { NextResponse } from "next/server";
import { readContentPack } from "@/lib/data";
import {
  parseMaterial,
  triggerParseInBackground,
  type ParseMaterialOptions,
} from "@/lib/material-parser";
import { shouldParseInBackground } from "@/lib/pack-patterns";
import {
  isLongMaterial,
  needsSegmentMinutesConfirm,
  transcriptDurationSec,
} from "@/lib/parse-token-policy";

export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let force = false;
  let allowAutoSubtitles = false;
  let segmentMinutes: number | undefined;
  let rangeStartSec: number | undefined;
  let rangeEndSec: number | undefined;
  let offlineOnly = false;

  try {
    const body = (await req.json()) as {
      force?: boolean;
      allowAutoSubtitles?: boolean;
      segmentMinutes?: number;
      rangeStartSec?: number;
      rangeEndSec?: number;
      offlineOnly?: boolean;
    };
    force = Boolean(body?.force);
    allowAutoSubtitles = Boolean(body?.allowAutoSubtitles);
    offlineOnly = Boolean(body?.offlineOnly);
    if (typeof body?.segmentMinutes === "number" && body.segmentMinutes > 0) {
      segmentMinutes = body.segmentMinutes;
    }
    if (typeof body?.rangeStartSec === "number") {
      rangeStartSec = body.rangeStartSec;
    }
    if (typeof body?.rangeEndSec === "number") {
      rangeEndSec = body.rangeEndSec;
    }
  } catch {
    // no body
  }

  const pack = await readContentPack(id);
  const lineCount = pack?.transcript.lines.length ?? 0;
  const durationSec = pack
    ? transcriptDurationSec(pack.transcript.lines)
    : 0;

  if (
    needsSegmentMinutesConfirm({
      lineCount,
      durationSec,
      segmentMinutes,
    })
  ) {
    return NextResponse.json({
      parseStatus: "pending",
      lines: lineCount,
      needsSegmentConfirm: true,
      isLong: true,
      durationSec,
      message: `素材较长（约 ${Math.ceil(durationSec / 60) || "?"} 分钟），请指定分段解析时长后再开始。`,
      stage: "failed",
    });
  }

  if (lineCount === 0 && !allowAutoSubtitles) {
    return NextResponse.json({
      parseStatus: "pending",
      lines: 0,
      awaitManualSubtitle: true,
      message:
        "请先上传与原声语种一致的 SRT/VTT，或勾选「允许自动获取字幕」后再解析。",
      stage: "failed",
    });
  }

  const options: ParseMaterialOptions = {
    force,
    allowAutoSubtitles,
    segmentMinutes,
    rangeStartSec,
    rangeEndSec,
    offlineOnly,
  };

  if (lineCount > 0 && shouldParseInBackground(lineCount)) {
    triggerParseInBackground(id, options);
    return NextResponse.json({
      parseStatus: "processing",
      lines: lineCount,
      message: `后台解析中（${lineCount} 行，分段 ${segmentMinutes ?? "全文"} 分钟，请稍候刷新）`,
      stage: "enriching",
      isLong: isLongMaterial({ lineCount, durationSec }),
    });
  }

  const result = await parseMaterial(id, options);
  return NextResponse.json(result);
}
