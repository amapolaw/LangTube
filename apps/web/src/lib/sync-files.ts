import fs from "fs";
import path from "path";
import type { StorageConfig, MaterialManifest, MaterialIndex } from "@langtube/core";
import { getDataDir, getMaterialsDir, getUserDir } from "./paths";
import { readDeletionsRegistrySync } from "./deletions-registry";

export interface SyncFileEntry {
  repoPath: string;
  localPath: string;
}

const MATERIAL_FILES = [
  "manifest.json",
  "transcript.json",
  "segments.json",
  "storage.json",
] as const;

const USER_FILES = [
  "settings.json",
  "profile.json",
  "marks.json",
  "notebook.json",
] as const;

/** 统一把本机绝对路径（含 Windows 反斜杠）收成 materials/{id}/media/... */
export function toRelativeMaterialsPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.startsWith("materials/")) return normalized;
  const matched = normalized.match(/data\/materials\/(.+)$/i);
  if (matched) return `materials/${matched[1]}`;
  // C:/.../materials/id/media/x.mp4 等兜底
  const alt = normalized.match(/materials\/([^/]+\/media\/[^/]+)$/i);
  if (alt) return `materials/${alt[1]}`;
  return normalized;
}

export function sanitizeStorageForSync(
  storage: StorageConfig
): StorageConfig {
  const sanitized: StorageConfig = {
    mode: storage.mode,
    provider: storage.provider,
  };
  if (storage.url) sanitized.url = storage.url;
  if (storage.fileId) sanitized.fileId = storage.fileId;
  if (storage.path) {
    const relative = toRelativeMaterialsPath(storage.path);
    if (relative.startsWith("materials/")) {
      sanitized.path = relative;
      // 有相对路径时跨设备以 url/sourceUrl 为主，避免绝对路径锁死
      if (storage.url) {
        sanitized.mode = "remote";
      } else {
        sanitized.mode = "local";
      }
    } else if (storage.url) {
      sanitized.mode = "remote";
    } else {
      sanitized.path = relative;
    }
  } else if (storage.url) {
    sanitized.mode = "remote";
  }
  return sanitized;
}

export function sanitizeManifestForSync(
  manifest: MaterialManifest
): MaterialManifest {
  return {
    ...manifest,
    storage: sanitizeStorageForSync(manifest.storage),
  };
}

/** 推送时脱敏，避免 GitHub Secret Scanning 拦截 */
export function sanitizeSettingsForSync(
  settings: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...settings };
  const secretKeys = [
    "llmApiKey",
    "githubToken",
    "cursorApiKey",
    "bilibiliCookies",
    "baiduCookies",
  ];
  for (const key of secretKeys) {
    if (out[key]) out[key] = "";
  }
  return out;
}

export function getAgentTasksDir(): string {
  return path.join(getDataDir(), "agent-tasks");
}

function localPathForRepoPath(repoPath: string): string {
  const dataDir = getDataDir();
  if (repoPath === "data/index.json") {
    return path.join(dataDir, "index.json");
  }
  if (repoPath === "data/deletions.json") {
    return path.join(dataDir, "deletions.json");
  }
  if (repoPath.startsWith("data/materials/")) {
    const relative = repoPath.replace("data/materials/", "");
    return path.join(getMaterialsDir(), relative);
  }
  if (repoPath.startsWith("data/user/")) {
    return path.join(getUserDir(), repoPath.replace("data/user/", ""));
  }
  if (repoPath.startsWith("data/agent-tasks/")) {
    return path.join(getAgentTasksDir(), repoPath.replace("data/agent-tasks/", ""));
  }
  return path.join(dataDir, repoPath.replace("data/", ""));
}

export function buildSyncEntry(repoPath: string): SyncFileEntry {
  return { repoPath, localPath: localPathForRepoPath(repoPath) };
}

/** index 中未删除的素材 id（同步范围基准） */
export function getActiveMaterialIdsFromIndex(): string[] {
  const indexPath = path.join(getDataDir(), "index.json");
  if (!fs.existsSync(indexPath)) return [];
  try {
    const index = JSON.parse(
      fs.readFileSync(indexPath, "utf-8")
    ) as MaterialIndex;
    const deleted = new Set(
      Object.keys(readDeletionsRegistrySync().materials)
    );
    return (index.materials ?? [])
      .map((m) => m.id)
      .filter((id) => !deleted.has(id));
  } catch {
    return [];
  }
}

export type ListSyncFilesOptions = {
  /** 仅为这些素材附带 agent-tasks（默认 true） */
  includeAgentTasks?: boolean;
};

export function listSyncFilesForMaterialIds(
  materialIds: string[],
  options?: ListSyncFilesOptions
): SyncFileEntry[] {
  const includeAgentTasks = options?.includeAgentTasks !== false;
  const files: SyncFileEntry[] = [buildSyncEntry("data/index.json")];

  const deletionsPath = path.join(getDataDir(), "deletions.json");
  if (fs.existsSync(deletionsPath)) {
    files.push(buildSyncEntry("data/deletions.json"));
  }

  const materialsDir = getMaterialsDir();
  for (const id of materialIds) {
    const materialDir = path.join(materialsDir, id);
    if (!fs.existsSync(materialDir) || !fs.statSync(materialDir).isDirectory()) {
      continue;
    }
    for (const name of MATERIAL_FILES) {
      const localPath = path.join(materialDir, name);
      if (fs.existsSync(localPath)) {
        files.push(buildSyncEntry(`data/materials/${id}/${name}`));
      }
    }
  }

  const userDir = getUserDir();
  for (const name of USER_FILES) {
    const localPath = path.join(userDir, name);
    if (fs.existsSync(localPath)) {
      files.push(buildSyncEntry(`data/user/${name}`));
    }
  }

  if (includeAgentTasks) {
    const agentTasksDir = getAgentTasksDir();
    for (const id of materialIds) {
      const taskPath = path.join(agentTasksDir, `${id}.json`);
      if (fs.existsSync(taskPath)) {
        files.push(buildSyncEntry(`data/agent-tasks/${id}.json`));
      }
    }
  }

  return files;
}

/** 仅同步 index 内活跃素材 + 对应 agent-tasks，避免历史任务文件打爆 GitHub API */
export function listSyncFiles(): SyncFileEntry[] {
  return listSyncFilesForMaterialIds(getActiveMaterialIdsFromIndex());
}

export function readFileForSync(entry: SyncFileEntry): string {
  const raw = fs.readFileSync(entry.localPath, "utf-8");
  if (entry.repoPath.endsWith("storage.json")) {
    const storage = JSON.parse(raw) as StorageConfig;
    return JSON.stringify(sanitizeStorageForSync(storage), null, 2);
  }
  if (entry.repoPath.endsWith("manifest.json")) {
    const manifest = JSON.parse(raw) as MaterialManifest;
    return JSON.stringify(sanitizeManifestForSync(manifest), null, 2);
  }
  if (entry.repoPath.endsWith("settings.json")) {
    const settings = JSON.parse(raw) as Record<string, unknown>;
    return JSON.stringify(sanitizeSettingsForSync(settings), null, 2);
  }
  return raw;
}
