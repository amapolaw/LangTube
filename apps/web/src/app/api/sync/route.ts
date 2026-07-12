import { NextResponse } from "next/server";
import { pushLearningData, pullLearningData } from "@/lib/github-sync";
import { rebuildMaterialIndex } from "@/lib/material-index-rebuild";
import { listSyncFiles } from "@/lib/sync-files";
import { getDataDir } from "@/lib/paths";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  const body = await req.json();
  const { action, materialId } = body;

  if (action === "status") {
    const dataDir = getDataDir();
    const syncFiles = listSyncFiles();
    const status = syncFiles.map((f) => ({
      file: f.repoPath,
      exists: fs.existsSync(f.localPath),
      modified: fs.existsSync(f.localPath)
        ? fs.statSync(f.localPath).mtime.toISOString()
        : null,
    }));
    return NextResponse.json({
      status,
      fileCount: syncFiles.length,
      repo: process.env.GITHUB_REPO ?? null,
    });
  }

  if (action === "export-json") {
    const dataDir = getDataDir();
    const exportData: Record<string, unknown> = {};
    const syncFiles = listSyncFiles();
    for (const entry of syncFiles) {
      if (fs.existsSync(entry.localPath)) {
        exportData[entry.repoPath] = JSON.parse(
          fs.readFileSync(entry.localPath, "utf-8")
        );
      }
    }
    const syncPath = path.join(dataDir, "sync-export.json");
    fs.writeFileSync(syncPath, JSON.stringify(exportData, null, 2));
    return NextResponse.json({ ok: true, path: syncPath, files: syncFiles.length });
  }

  if (action === "push") {
    try {
      const result = await pushLearningData({
        repo: body.repo,
        token: body.token,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          message: err instanceof Error ? err.message : "Push failed",
        },
        { status: 500 }
      );
    }
  }

  if (action === "repair") {
    const rebuilt = await rebuildMaterialIndex();
    return NextResponse.json({
      ok: true,
      ...rebuilt,
      message: `已从本地目录恢复 index，共 ${rebuilt.total} 个素材（新增 ${rebuilt.recovered} 条）`,
    });
  }

  if (action === "pull") {
    try {
      const result = materialId
        ? await pullLearningData({
            materialId,
            repo: body.repo,
            token: body.token,
          })
        : await pullLearningData({
            repo: body.repo,
            token: body.token,
          });
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          message: err instanceof Error ? err.message : "Pull failed",
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    message: "支持 action: status | export-json | push | pull",
  });
}
