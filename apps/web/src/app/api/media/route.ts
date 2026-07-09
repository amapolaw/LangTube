import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get("path");
  if (!filePath || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const stream = fs.createReadStream(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".mp4"
      ? "video/mp4"
      : ext === ".webm"
        ? "video/webm"
        : ext === ".mp3"
          ? "audio/mpeg"
          : "application/octet-stream";

  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": stat.size.toString(),
    },
  });
}
