import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getMaterialsDir, getMaterialDir } from "@/lib/paths";
import { readContentPack } from "@/lib/data";
import { normalizeMaterialId } from "@/lib/material-id";
import {
  ensureBrowserPlayable,
  needsBrowserTranscode,
  browserMp4Path,
} from "@/lib/media-transcode";

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
};

function resolveContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function isAllowedMediaPath(filePath: string): boolean {
  const materialsDir = path.resolve(getMaterialsDir());
  const resolved = path.resolve(filePath);
  return resolved.startsWith(materialsDir + path.sep);
}

function findMediaInMaterial(materialId: string): string | null {
  const mediaDir = path.join(getMaterialDir(materialId), "media");
  if (!fs.existsSync(mediaDir)) return null;
  const preferred = [
    ".browser.mp4",
    ".mp4",
    ".webm",
    ".mkv",
    ".mov",
    ".m4v",
    ".mp3",
    ".m4a",
  ];
  const files = fs.readdirSync(mediaDir).filter((f) => !f.startsWith("."));
  for (const suffix of preferred) {
    const hit = files.find((f) => f.toLowerCase().endsWith(suffix));
    if (hit) return path.join(mediaDir, hit);
  }
  return files[0] ? path.join(mediaDir, files[0]) : null;
}

async function resolveSourcePath(
  searchParams: URLSearchParams
): Promise<string | null> {
  const rawId = searchParams.get("materialId");
  if (rawId) {
    const materialId = normalizeMaterialId(rawId);
    const pack = await readContentPack(materialId);
    if (pack?.storage.path && fs.existsSync(pack.storage.path)) {
      const stored = pack.storage.path;
      if (needsBrowserTranscode(stored)) {
        const browser = browserMp4Path(stored);
        if (fs.existsSync(browser) && fs.statSync(browser).size > 1000) {
          return browser;
        }
      }
      return stored;
    }
    return findMediaInMaterial(materialId);
  }

  const filePath = searchParams.get("path");
  if (!filePath) return null;
  let candidate = filePath;
  try {
    candidate = decodeURIComponent(filePath);
  } catch {
    candidate = filePath;
  }
  // 双重编码兜底
  try {
    const twice = decodeURIComponent(candidate);
    if (fs.existsSync(twice)) candidate = twice;
  } catch {
    /* ignore */
  }
  if (isAllowedMediaPath(candidate) && fs.existsSync(candidate)) {
    return candidate;
  }
  if (isAllowedMediaPath(filePath) && fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

async function resolvePlayablePath(
  searchParams: URLSearchParams,
  transcode: boolean
): Promise<string | null> {
  const source = await resolveSourcePath(searchParams);
  if (!source) return null;
  if (!transcode || !needsBrowserTranscode(source)) return source;
  try {
    const ready = await ensureBrowserPlayable(source);
    return ready.path;
  } catch (err) {
    console.warn("[media] transcode failed, serving original:", err);
    return source;
  }
}

function streamFile(filePath: string, rangeHeader: string | null) {
  const stat = fs.statSync(filePath);
  const contentType = resolveContentType(filePath);

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (!match) return new NextResponse(null, { status: 416 });
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (start >= stat.size || end >= stat.size) {
      return new NextResponse(null, { status: 416 });
    }
    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    return new NextResponse(stream as unknown as BodyInit, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize.toString(),
        "Content-Type": contentType,
      },
    });
  }

  const stream = fs.createReadStream(filePath);
  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": stat.size.toString(),
      "Accept-Ranges": "bytes",
    },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filePath = await resolvePlayablePath(searchParams, true);
  if (!filePath || !isAllowedMediaPath(filePath) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  return streamFile(filePath, req.headers.get("range"));
}

export async function HEAD(req: Request) {
  const { searchParams } = new URL(req.url);
  // HEAD 不阻塞转码，只要源文件或已转码文件存在
  const source = await resolveSourcePath(searchParams);
  if (!source || !isAllowedMediaPath(source) || !fs.existsSync(source)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const browserSibling = browserMp4Path(source);
  const playable =
    needsBrowserTranscode(source) &&
    fs.existsSync(browserSibling) &&
    fs.statSync(browserSibling).size > 1000
      ? browserSibling
      : source;
  const stat = fs.statSync(playable);
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": resolveContentType(playable),
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
    },
  });
}
