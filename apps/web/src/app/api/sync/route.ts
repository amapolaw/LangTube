import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getDataDir } from "@/lib/paths";

export async function POST(req: Request) {
  const { action, repo, token } = await req.json();

  if (action === "status") {
    const dataDir = getDataDir();
    const files = ["index.json", "user/settings.json", "user/profile.json"];
    const status = files.map((f) => ({
      file: f,
      exists: fs.existsSync(path.join(dataDir, f)),
      modified: fs.existsSync(path.join(dataDir, f))
        ? fs.statSync(path.join(dataDir, f)).mtime.toISOString()
        : null,
    }));
    return NextResponse.json({ status, repo: repo ?? process.env.GITHUB_REPO });
  }

  if (action === "export-json") {
    const dataDir = getDataDir();
    const exportData: Record<string, unknown> = {};
    const indexPath = path.join(dataDir, "index.json");
    if (fs.existsSync(indexPath)) {
      exportData.index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    }
    const materialsDir = path.join(dataDir, "materials");
    if (fs.existsSync(materialsDir)) {
      exportData.materials = {};
      for (const id of fs.readdirSync(materialsDir)) {
        const manifestPath = path.join(materialsDir, id, "manifest.json");
        if (fs.existsSync(manifestPath)) {
          (exportData.materials as Record<string, unknown>)[id] = JSON.parse(
            fs.readFileSync(manifestPath, "utf-8")
          );
        }
      }
    }
    const syncPath = path.join(dataDir, "sync-export.json");
    fs.writeFileSync(syncPath, JSON.stringify(exportData, null, 2));
    return NextResponse.json({ ok: true, path: syncPath });
  }

  return NextResponse.json({
    ok: true,
    message:
      "GitHub sync prepared. Configure GITHUB_REPO and GITHUB_TOKEN, then run: pnpm sync",
    token: token ? "configured" : "missing",
  });
}
