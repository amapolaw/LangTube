import { NextResponse } from "next/server";
import { readContentPack, deleteMaterial } from "@/lib/data";
import { deleteMaterialMarks } from "@/lib/marks-service";

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
  return NextResponse.json({ ok: true });
}
