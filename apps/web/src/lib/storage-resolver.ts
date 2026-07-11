import path from "path";
import fs from "fs";
import type { StorageConfig } from "@langtube/core";
import { getMaterialDir, getMaterialsDir } from "./paths";

/** Convert relative sync path to absolute local path for playback. */
export function hydrateStoragePath(
  materialId: string,
  storage: StorageConfig
): StorageConfig {
  const hydrated = { ...storage };

  if (hydrated.path) {
    const normalized = hydrated.path.replace(/\\/g, "/");
    hydrated.path = normalized;

    if (normalized.startsWith("materials/")) {
      const relative = normalized.replace(/^materials\//, "");
      const absolute = path.join(getMaterialsDir(), relative);
      if (fs.existsSync(absolute)) {
        hydrated.path = absolute;
      } else {
        const fallback = path.join(
          getMaterialDir(materialId),
          "media",
          path.basename(normalized)
        );
        if (fs.existsSync(fallback)) {
          hydrated.path = fallback;
        }
      }
    } else if (/^[A-Za-z]:\//.test(normalized) || normalized.includes("/data/materials/")) {
      // 他机绝对路径：尝试按 materials/{id}/media/文件名 在本机还原
      const basename = path.basename(normalized);
      const localCandidate = path.join(
        getMaterialDir(materialId),
        "media",
        basename
      );
      if (fs.existsSync(localCandidate)) {
        hydrated.path = localCandidate;
      } else if (storage.url) {
        // 本机无文件时清掉无效绝对路径，改走 url
        delete hydrated.path;
        hydrated.mode = "remote";
      }
    }
  }

  return hydrated;
}

/** Convert absolute local path to relative for Git sync. */
export function dehydrateStoragePath(storage: StorageConfig): StorageConfig {
  const dehydrated = { ...storage };
  if (dehydrated.path && !dehydrated.path.startsWith("materials/")) {
    const normalized = dehydrated.path.replace(/\\/g, "/");
    const matched = normalized.match(/data\/materials\/(.+)$/i);
    if (matched) {
      dehydrated.path = `materials/${matched[1]}`;
    } else {
      dehydrated.path = normalized.replace(/^.*\/data\/materials\//, "materials/");
    }
  }
  return dehydrated;
}

export function getMediaFilename(storage: StorageConfig): string | undefined {
  if (!storage.path) return undefined;
  return path.basename(storage.path);
}

export function getRelativeMediaPath(
  materialId: string,
  filename: string
): string {
  return `materials/${materialId}/media/${filename}`;
}
