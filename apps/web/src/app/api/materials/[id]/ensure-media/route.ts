import { NextResponse } from "next/server";
import { readContentPack } from "@/lib/data";
import { ensureMaterialMediaDownload } from "@/lib/ensure-media";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 将素材远程链接下载到本地 media/，供影子跟读精确截句。
 * POST /api/materials/[id]/ensure-media
 * body?: { sourceUrl?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pack = await readContentPack(id);
  if (!pack) {
    return NextResponse.json({ error: "Material not found" }, { status: 404 });
  }

  let body: { sourceUrl?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }

  const result = await ensureMaterialMediaDownload(id, body.sourceUrl);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json(result);
}
