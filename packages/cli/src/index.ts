#!/usr/bin/env node
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import {
  validateContentPack,
  mergeIndexEntry,
  type ContentPack,
  type MaterialIndex,
} from "@langtube/core";

const DATA_DIR =
  process.env.LANGTUBE_DATA_DIR ??
  findMonorepoDataDir();

function findMonorepoDataDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const dataPath = path.join(dir, "data");
    const workspacePath = path.join(dir, "pnpm-workspace.yaml");
    try {
      if (
        fsSync.existsSync(workspacePath) &&
        fsSync.existsSync(dataPath)
      ) {
        return dataPath;
      }
    } catch {
      /* continue */
    }
    dir = path.dirname(dir);
  }
  return path.join(process.cwd(), "data");
}

async function loadPack(materialDir: string): Promise<ContentPack> {
  const read = async (file: string) =>
    JSON.parse(await fs.readFile(path.join(materialDir, file), "utf-8"));

  return {
    manifest: await read("manifest.json"),
    transcript: await read("transcript.json"),
    segments: await read("segments.json"),
    storage: await read("storage.json"),
    drills: await tryRead(path.join(materialDir, "drills.json")),
  };
}

async function tryRead(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    return undefined;
  }
}

async function validate(materialPath: string) {
  const pack = await loadPack(materialPath);
  const errors = validateContentPack(pack);
  if (errors.length) {
    console.error("Validation failed:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
  console.log(`✓ ${pack.manifest.id} is valid`);
}

async function importPack(materialPath: string) {
  const pack = await loadPack(materialPath);
  const errors = validateContentPack(pack);
  if (errors.length) {
    console.error("Cannot import:", errors.join(", "));
    process.exit(1);
  }

  const indexPath = path.join(DATA_DIR, "index.json");
  let index: MaterialIndex = { version: 1, materials: [] };
  try {
    index = JSON.parse(await fs.readFile(indexPath, "utf-8"));
  } catch {
    /* new index */
  }

  index = mergeIndexEntry(index, pack.manifest);
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  console.log(`✓ Imported ${pack.manifest.id} to index`);
}

async function sync() {
  const exportPath = path.join(DATA_DIR, "sync-export.json");
  const indexPath = path.join(DATA_DIR, "index.json");
  const exportData: Record<string, unknown> = {};

  if (await exists(indexPath)) {
    exportData.index = JSON.parse(await fs.readFile(indexPath, "utf-8"));
  }

  const materialsDir = path.join(DATA_DIR, "materials");
  if (await exists(materialsDir)) {
    exportData.materials = {};
    const ids = await fs.readdir(materialsDir);
    for (const id of ids) {
      const manifestPath = path.join(materialsDir, id, "manifest.json");
      if (await exists(manifestPath)) {
        (exportData.materials as Record<string, unknown>)[id] = JSON.parse(
          await fs.readFile(manifestPath, "utf-8")
        );
      }
    }
  }

  await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));
  console.log(`✓ Sync export written to ${exportPath}`);
  console.log("  Push data/ to GitHub manually or use git:");
  console.log("  git add data/index.json data/materials/*/manifest.json data/sync-export.json");
  console.log("  git commit -m 'sync learning progress'");
  console.log("  git push");
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const [,, command, target] = process.argv;

switch (command) {
  case "validate":
    if (!target) {
      console.error("Usage: langtube validate <material-dir>");
      process.exit(1);
    }
    await validate(path.resolve(target));
    break;
  case "import":
    if (!target) {
      console.error("Usage: langtube import <material-dir>");
      process.exit(1);
    }
    await importPack(path.resolve(target));
    break;
  case "sync":
    await sync();
    break;
  default:
    console.log(`LangTube CLI

Usage:
  langtube validate <material-dir>   Validate Content Pack
  langtube import  <material-dir>   Import to index.json
  langtube sync                     Export sync data for GitHub
`);
}
