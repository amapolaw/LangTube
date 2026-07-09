import { NextResponse } from "next/server";
import { getAllMarks } from "@/lib/marks-service";

export async function GET() {
  return NextResponse.json(getAllMarks());
}
