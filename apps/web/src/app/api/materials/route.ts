import { NextResponse } from "next/server";
import { readIndex } from "@/lib/data";

export async function GET() {
  const index = await readIndex();
  return NextResponse.json(index);
}
