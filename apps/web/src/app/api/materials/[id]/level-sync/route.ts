import { NextResponse } from "next/server";
import { readContentPack, saveContentPack } from "@/lib/data";
import { applyLevelFilterAndNotebook } from "@/lib/level-reference/sync-notebook";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 按素材等级对照 Language 参考资料甄别，并写入 Notebook。
 * POST /api/materials/[id]/level-sync
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pack = await readContentPack(id);
  if (!pack) {
    return NextResponse.json({ error: "Material not found" }, { status: 404 });
  }

  try {
    const result = await applyLevelFilterAndNotebook(pack, {
      addToNotebook: true,
      maxNotebookCards: 40,
    });
    await saveContentPack(pack);
    return NextResponse.json({
      ok: true,
      ...result,
      vocabulary: pack.manifest.vocabulary.length,
      patterns: pack.manifest.patterns.length,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "level sync failed",
      },
      { status: 500 }
    );
  }
}
