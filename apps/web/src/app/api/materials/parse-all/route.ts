import { NextResponse } from "next/server";
import { readContentPack, readIndex, saveContentPack } from "@/lib/data";
import {
  parseMaterial,
  triggerParseInBackground,
  type ParseMaterialOptions,
} from "@/lib/material-parser";
import { shouldParseInBackground } from "@/lib/pack-patterns";
import { getDeletedMaterialIds } from "@/lib/deletions-registry";

export const maxDuration = 300;

type ParseAllBody = {
  force?: boolean;
  /** auto=默认（大素材后台排队）；offline=跳过 LLM，规则+词典 */
  mode?: "auto" | "offline";
  /** offline 时默认 true：逐条串行、跳过同步推送 */
  sequential?: boolean;
};

function buildOfflineOptions(lines: number): ParseMaterialOptions {
  const vocabDictLimit = Math.min(800, Math.max(200, Math.ceil(lines * 0.4)));
  return {
    force: true,
    offlineOnly: true,
    skipSync: true,
    referenceOptions: {
      dictLimit: vocabDictLimit,
      dictDelayMs: 280,
    },
  };
}

/**
 * POST /api/materials/parse-all
 * 对 listen 列表全部素材触发全量解析（默认 force）。
 * mode=offline：稳妥逐条解析，不依赖 Cursor LLM。
 */
export async function POST(req: Request) {
  let force = true;
  let mode: ParseAllBody["mode"] = "auto";
  let sequential = false;
  try {
    const body = (await req.json()) as ParseAllBody;
    if (body?.force === false) force = false;
    if (body?.mode === "offline") mode = "offline";
    if (body?.sequential === true) sequential = true;
    if (mode === "offline") sequential = true;
  } catch {
    // default force
  }

  const index = await readIndex();
  const deleted = await getDeletedMaterialIds();
  const materials = index.materials.filter((m) => !deleted.has(m.id));

  const queued: string[] = [];
  const results: {
    id: string;
    title: string;
    parseStatus: string;
    message: string;
  }[] = [];

  const parseOpts: ParseMaterialOptions | undefined =
    mode === "offline"
      ? { force, offlineOnly: true, skipSync: true }
      : { force };

  for (const m of materials) {
    if (force) {
      const pack = await readContentPack(m.id);
      if (pack) {
        pack.manifest.enrichmentMode = undefined;
        if (pack.manifest.parseStatus === "processing") {
          pack.manifest.parseStatus = "pending";
        }
        await saveContentPack(pack);
      }
    }

    const pack = await readContentPack(m.id);
    const lines = pack?.transcript.lines.length ?? 0;
    const jobOpts: ParseMaterialOptions =
      mode === "offline" && lines > 0
        ? buildOfflineOptions(lines)
        : { ...parseOpts, force };

    if (sequential || mode === "offline") {
      triggerParseInBackground(m.id, jobOpts);
      queued.push(m.id);
      results.push({
        id: m.id,
        title: m.title,
        parseStatus: "processing",
        message:
          mode === "offline"
            ? `已排队稳妥离线解析（${lines} 行字幕，逐条串行，跳过 LLM）`
            : `已排队后台解析（${lines} 行字幕，按顺序执行）`,
      });
      continue;
    }

    if (lines > 0 && shouldParseInBackground(lines)) {
      triggerParseInBackground(m.id, jobOpts);
      queued.push(m.id);
      results.push({
        id: m.id,
        title: m.title,
        parseStatus: "processing",
        message: `已排队后台解析（${lines} 行字幕，按顺序执行）`,
      });
      continue;
    }

    const result = await parseMaterial(m.id, jobOpts);
    results.push({
      id: m.id,
      title: m.title,
      parseStatus: result.parseStatus,
      message: result.message,
    });
  }

  return NextResponse.json({
    ok: true,
    total: materials.length,
    queued: queued.length,
    mode,
    sequential,
    results,
    message:
      mode === "offline"
        ? `已触发 ${materials.length} 个素材稳妥离线解析（${queued.length} 个逐条排队，不调用 LLM）`
        : `已触发 ${materials.length} 个素材全量解析（${queued.length} 个后台进行）`,
  });
}
