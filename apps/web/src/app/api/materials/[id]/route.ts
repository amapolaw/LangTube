import { NextResponse } from "next/server";
import { readContentPack, deleteMaterial } from "@/lib/data";
import { deleteMaterialMarks } from "@/lib/marks-service";
import { syncMaterialDeletionToGitHub } from "@/lib/github-sync";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pack = await readContentPack(id);
  if (!pack) {
    return NextResponse.json({ error: "Material not found" }, { status: 404 });
  }
  return NextResponse.json(pack);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = await deleteMaterial(id);
  if (!ok) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  deleteMaterialMarks(id);
  let syncMessage: string | undefined;
  try {
    const sync = await syncMaterialDeletionToGitHub(id);
    syncMessage = sync.message;
  } catch (err) {
    console.warn("[delete-material] GitHub sync failed:", err);
    syncMessage =
      err instanceof Error ? err.message : "GitHub 远端删除未完成";
  }
  return NextResponse.json({ ok: true, syncMessage });
}
