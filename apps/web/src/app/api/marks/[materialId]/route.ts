import { NextResponse } from "next/server";
import {
  getMaterialMarks,
  saveMaterialMarks,
  toggleMark,
  deleteMaterialMarks,
} from "@/lib/marks-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ materialId: string }> }
) {
  const { materialId } = await params;
  return NextResponse.json(getMaterialMarks(materialId));
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ materialId: string }> }
) {
  const { materialId } = await params;
  const body = await req.json();

  if (body.action === "toggle" && body.category && body.itemId) {
    const marks = toggleMark(materialId, body.category, body.itemId);
    return NextResponse.json(marks);
  }

  const marks = saveMaterialMarks(materialId, body);
  return NextResponse.json(marks);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ materialId: string }> }
) {
  const { materialId } = await params;
  deleteMaterialMarks(materialId);
  return NextResponse.json({ ok: true });
}
