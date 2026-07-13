import fs from "fs";
import path from "path";
import { readSettings } from "@/lib/data";
import {
  listSyncFiles,
  listSyncFilesForMaterialIds,
  buildSyncEntry,
  readFileForSync,
  getAgentTasksDir,
  type SyncFileEntry,
} from "@/lib/sync-files";
import type { MaterialIndex } from "@langtube/core";
import {
  rebuildMaterialIndex,
  mergeMaterialIndexes,
} from "@/lib/material-index-rebuild";
import { safeParseJson, sanitizeSyncedJsonText } from "@/lib/json-sync-sanitize";
import {
  readDeletionsRegistry,
  writeDeletionsRegistry,
  mergeDeletionsRegistries,
  getDeletedMaterialIds,
  isDeletedMaterialPath,
  type DeletionsRegistry,
} from "@/lib/deletions-registry";
import { readIndex, writeIndex } from "@/lib/data";
import { getMaterialDir, getDeletionsPath } from "@/lib/paths";

interface GitHubCredentials {
  owner: string;
  repo: string;
  token: string;
}

interface GitHubContentItem {
  name: string;
  path: string;
  type: "file" | "dir";
  content?: string;
  encoding?: string;
}

export async function getCredentials(overrides?: {
  repo?: string;
  token?: string;
}): Promise<GitHubCredentials | null> {
  const settings = await readSettings();
  const repoStr =
    overrides?.repo?.trim() ||
    settings.githubRepo?.trim() ||
    process.env.GITHUB_REPO?.trim() ||
    "";
  const token =
    overrides?.token?.trim() ||
    settings.githubToken?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    "";
  if (!repoStr || !token) return null;

  const [owner, repo] = repoStr.split("/");
  if (!owner || !repo) return null;
  return { owner, repo, token };
}

/** 说明 GitHub 同步缺哪一项，便于日志与设置页提示 */
export async function describeGitHubConfigGap(overrides?: {
  repo?: string;
  token?: string;
}): Promise<string | null> {
  const settings = await readSettings();
  const repoStr =
    overrides?.repo?.trim() ||
    settings.githubRepo?.trim() ||
    process.env.GITHUB_REPO?.trim() ||
    "";
  const token =
    overrides?.token?.trim() ||
    settings.githubToken?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    "";

  if (!repoStr && !token) {
    return "GitHub 未配置：请填写仓库（owner/repo）与 Token";
  }
  if (!repoStr) {
    return "GitHub 未配置：缺少仓库地址（格式 owner/repo，例如 amapolaw/LangTube）";
  }
  if (!token) {
    return "GitHub 未配置：缺少 Token";
  }
  const [owner, repo] = repoStr.split("/");
  if (!owner || !repo) {
    return "GitHub 未配置：仓库格式应为 owner/repo";
  }
  return null;
}

async function githubFetch(
  creds: GitHubCredentials,
  apiPath: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`https://api.github.com${apiPath}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${creds.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
}

async function getFileSha(
  creds: GitHubCredentials,
  repoPath: string
): Promise<string | null> {
  const res = await githubFetch(
    creds,
    `/repos/${creds.owner}/${creds.repo}/contents/${repoPath}`
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub get file failed: ${await res.text()}`);
  const data = (await res.json()) as { sha?: string };
  return data.sha ?? null;
}

async function fetchRemoteFileContent(
  creds: GitHubCredentials,
  repoPath: string
): Promise<string | null> {
  const res = await githubFetch(
    creds,
    `/repos/${creds.owner}/${creds.repo}/contents/${repoPath}`
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;

  const data = (await res.json()) as GitHubContentItem;
  if (!data.content) return null;
  return sanitizeSyncedJsonText(
    Buffer.from(data.content, "base64").toString("utf-8")
  );
}

async function listRemoteDirectory(
  creds: GitHubCredentials,
  repoPath: string
): Promise<GitHubContentItem[]> {
  const res = await githubFetch(
    creds,
    `/repos/${creds.owner}/${creds.repo}/contents/${repoPath}`
  );
  if (res.status === 404) return [];
  if (!res.ok) return [];
  const data = (await res.json()) as GitHubContentItem | GitHubContentItem[];
  return Array.isArray(data) ? data : [];
}

async function deleteRemoteFile(
  creds: GitHubCredentials,
  repoPath: string,
  message: string
): Promise<boolean> {
  const sha = await getFileSha(creds, repoPath);
  if (!sha) return false;
  const res = await githubFetch(
    creds,
    `/repos/${creds.owner}/${creds.repo}/contents/${repoPath}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sha }),
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub delete ${repoPath} failed: ${await res.text()}`);
  }
  return true;
}

const MATERIAL_SYNC_FILES = [
  "manifest.json",
  "transcript.json",
  "segments.json",
  "storage.json",
  "drills.json",
] as const;

async function deleteRemoteMaterialFiles(
  creds: GitHubCredentials,
  materialId: string,
  message: string
): Promise<number> {
  let deleted = 0;
  const base = `data/materials/${materialId}`;
  const items = await listRemoteDirectory(creds, base);
  for (const item of items) {
    if (item.type === "file") {
      if (await deleteRemoteFile(creds, item.path, message)) deleted++;
      continue;
    }
    if (item.type === "dir") {
      const nested = await listRemoteDirectory(creds, item.path);
      for (const child of nested) {
        if (child.type === "file") {
          if (await deleteRemoteFile(creds, child.path, message)) deleted++;
        }
      }
    }
  }
  for (const name of MATERIAL_SYNC_FILES) {
    try {
      if (await deleteRemoteFile(creds, `${base}/${name}`, message)) deleted++;
    } catch {
      // already removed or missing
    }
  }
  try {
    if (
      await deleteRemoteFile(
        creds,
        `data/agent-tasks/${materialId}.json`,
        message
      )
    ) {
      deleted++;
    }
  } catch {
    // ignore
  }
  return deleted;
}

async function pushRemoteDeletions(
  creds: GitHubCredentials,
  deletedIds: Set<string>,
  message: string
): Promise<number> {
  let deleted = 0;
  for (const id of deletedIds) {
    deleted += await deleteRemoteMaterialFiles(creds, id, message);
  }
  return deleted;
}

async function purgeLocalDeletedMaterials(
  deletedIds: Set<string>
): Promise<number> {
  let purged = 0;
  for (const id of deletedIds) {
    try {
      await fs.promises.rm(getMaterialDir(id), { recursive: true, force: true });
      purged++;
    } catch {
      // ignore
    }
    try {
      await fs.promises.unlink(path.join(getAgentTasksDir(), `${id}.json`));
    } catch {
      // ignore
    }
  }
  const index = await readIndex();
  const before = index.materials.length;
  index.materials = index.materials.filter((m) => !deletedIds.has(m.id));
  if (index.materials.length !== before) {
    await writeIndex(index);
  }
  return purged;
}

async function syncDeletionsRegistryFromRemote(
  creds: GitHubCredentials
): Promise<Set<string>> {
  const local = await readDeletionsRegistry();
  const remoteRaw = await fetchRemoteFileContent(creds, "data/deletions.json");
  const remote = safeParseJson<DeletionsRegistry>(remoteRaw ?? "") ?? {
    version: 1 as const,
    materials: {},
  };
  const merged = mergeDeletionsRegistries(local, remote);
  await writeDeletionsRegistry(merged);
  return new Set(Object.keys(merged.materials));
}

async function putFile(
  creds: GitHubCredentials,
  entry: SyncFileEntry,
  message: string
): Promise<void> {
  if (!fs.existsSync(entry.localPath)) return;

  const content = Buffer.from(readFileForSync(entry)).toString("base64");
  const sha = await getFileSha(creds, entry.repoPath);
  const res = await githubFetch(
    creds,
    `/repos/${creds.owner}/${creds.repo}/contents/${entry.repoPath}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content,
        ...(sha ? { sha } : {}),
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub put ${entry.repoPath} failed: ${await res.text()}`);
  }
}

function shouldPreferRemote(
  local: string,
  remote: string,
  repoPath: string
): boolean {
  if (!local.trim()) return true;
  if (local === remote) return false;
  try {
    const localJson = JSON.parse(local) as {
      updatedAt?: string;
      materials?: { id?: string; updatedAt?: string }[];
    };
    const remoteJson = JSON.parse(remote) as {
      updatedAt?: string;
      materials?: { id?: string; updatedAt?: string }[];
    };

    // index.json：按条目合并，不整文件覆盖
    if (repoPath === "data/index.json") {
      return false; // pullFile 对 index 走 mergeIndexContents
    }

    if (localJson.updatedAt && remoteJson.updatedAt) {
      return (
        new Date(remoteJson.updatedAt).getTime() >
        new Date(localJson.updatedAt).getTime()
      );
    }
  } catch {
    // non-json
  }
  // 无 updatedAt 时：远程优先（跨设备拉取公司机新导入）
  return (
    repoPath.includes("transcript") ||
    repoPath.includes("manifest") ||
    repoPath.includes("storage") ||
    repoPath.includes("agent-tasks")
  );
}

function mergeIndexContents(
  local: string,
  remote: string,
  deletedIds: Set<string>
): string {
  const localIndex =
    safeParseJson<MaterialIndex>(local) ??
    ({ version: 1, materials: [] } as MaterialIndex);
  const remoteIndex = safeParseJson<MaterialIndex>(remote);
  if (!remoteIndex) {
    console.warn("[github-sync] remote index.json 无效，保留本地 index");
    const filtered = {
      ...localIndex,
      materials: localIndex.materials.filter((m) => !deletedIds.has(m.id)),
    };
    return JSON.stringify(filtered, null, 2);
  }
  const merged = mergeMaterialIndexes(localIndex, remoteIndex, deletedIds);
  return JSON.stringify(merged, null, 2);
}

async function discoverRemoteSyncFiles(
  creds: GitHubCredentials,
  deletedIds: Set<string>
): Promise<SyncFileEntry[]> {
  const entries: SyncFileEntry[] = [
    buildSyncEntry("data/index.json"),
    buildSyncEntry("data/deletions.json"),
  ];

  const indexContent = await fetchRemoteFileContent(creds, "data/index.json");
  let materialIds: string[] = [];

  if (indexContent) {
    try {
      const index = JSON.parse(indexContent) as MaterialIndex;
      materialIds = index.materials?.map((m) => m.id) ?? [];
    } catch {
      // fallback to directory listing
    }
  }

  if (materialIds.length === 0) {
    const dirs = await listRemoteDirectory(creds, "data/materials");
    materialIds = dirs.filter((d) => d.type === "dir").map((d) => d.name);
  }

  for (const id of materialIds) {
    if (deletedIds.has(id)) continue;
    for (const name of [
      "manifest.json",
      "transcript.json",
      "segments.json",
      "storage.json",
    ]) {
      entries.push(buildSyncEntry(`data/materials/${id}/${name}`));
    }
  }

  for (const name of [
    "settings.json",
    "profile.json",
    "marks.json",
    "notebook.json",
  ]) {
    entries.push(buildSyncEntry(`data/user/${name}`));
  }

  for (const id of materialIds) {
    if (deletedIds.has(id)) continue;
    entries.push(buildSyncEntry(`data/agent-tasks/${id}.json`));
  }

  return entries;
}

async function pullFile(
  creds: GitHubCredentials,
  entry: SyncFileEntry,
  deletedIds: Set<string>
): Promise<boolean> {
  if (isDeletedMaterialPath(entry.repoPath, deletedIds)) {
    return false;
  }

  const remoteContent = await fetchRemoteFileContent(creds, entry.repoPath);
  if (remoteContent === null) return false;

  const localExists = fs.existsSync(entry.localPath);
  const localContent = localExists
    ? fs.readFileSync(entry.localPath, "utf-8")
    : "";

  if (entry.repoPath === "data/deletions.json") {
    const local = safeParseJson<DeletionsRegistry>(localContent) ?? {
      version: 1,
      materials: {},
    };
    const remote = safeParseJson<DeletionsRegistry>(remoteContent) ?? {
      version: 1,
      materials: {},
    };
    const merged = mergeDeletionsRegistries(local, remote);
    const mergedText = JSON.stringify(merged, null, 2);
    if (mergedText === localContent) return false;
    fs.mkdirSync(path.dirname(entry.localPath), { recursive: true });
    fs.writeFileSync(entry.localPath, mergedText);
    return true;
  }

  if (entry.repoPath === "data/index.json") {
    const merged = mergeIndexContents(localContent, remoteContent, deletedIds);
    if (merged === localContent) return false;
    fs.mkdirSync(path.dirname(entry.localPath), { recursive: true });
    fs.writeFileSync(entry.localPath, merged);
    return true;
  }

  if (!shouldPreferRemote(localContent, remoteContent, entry.repoPath)) {
    return false;
  }

  const sanitized = sanitizeSyncedJsonText(remoteContent);
  if (!sanitized) return false;

  fs.mkdirSync(path.dirname(entry.localPath), { recursive: true });
  fs.writeFileSync(entry.localPath, sanitized);
  return true;
}

export async function pushLearningData(overrides?: {
  repo?: string;
  token?: string;
}): Promise<{
  pushed: number;
  deleted: number;
  message: string;
}> {
  const creds = await getCredentials(overrides);
  if (!creds) {
    const gap =
      (await describeGitHubConfigGap(overrides)) ??
      "GitHub 未配置，跳过同步";
    return { pushed: 0, deleted: 0, message: gap };
  }

  const deletedIds = await getDeletedMaterialIds();
  await purgeLocalDeletedMaterials(deletedIds);

  if (!fs.existsSync(getDeletionsPath())) {
    await writeDeletionsRegistry({ version: 1, materials: {} });
  }
  const files = listSyncFiles();

  const message = `langtube sync ${new Date().toISOString()}`;
  let pushed = 0;
  let deleted = 0;
  const errors: string[] = [];

  for (const entry of files) {
    try {
      await putFile(creds, entry, message);
      pushed++;
    } catch (err) {
      errors.push(
        `${entry.repoPath}: ${err instanceof Error ? err.message : "push failed"}`
      );
    }
  }

  try {
    deleted = await pushRemoteDeletions(creds, deletedIds, message);
  } catch (err) {
    errors.push(
      `remote deletions: ${err instanceof Error ? err.message : "delete failed"}`
    );
  }

  const parts = [`已推送 ${pushed} 个文件到 ${creds.owner}/${creds.repo}`];
  if (deleted > 0) parts.push(`远端删除 ${deleted} 个文件`);
  if (errors.length > 0) parts.push(`跳过 ${errors.length} 个失败项`);

  return {
    pushed,
    deleted,
    message: parts.join("；"),
  };
}

/** 本地删除素材后，将删除登记与远端清理推送到 GitHub */
export async function syncMaterialDeletionToGitHub(
  _materialId: string,
  overrides?: { repo?: string; token?: string }
): Promise<{ pushed: number; deleted: number; message: string }> {
  return pushLearningData(overrides);
}

export async function pullLearningData(
  options?: {
    materialId?: string;
    repo?: string;
    token?: string;
  }
): Promise<{ pulled: number; message: string; errors?: string[] }> {
  const creds = await getCredentials(options);
  if (!creds) {
    const gap =
      (await describeGitHubConfigGap(options)) ?? "GitHub 未配置";
    return { pulled: 0, message: gap };
  }

  // 合并删除登记，并清理本地/远端已删除素材残留
  const deletedIds = await syncDeletionsRegistryFromRemote(creds);
  await purgeLocalDeletedMaterials(deletedIds);

  const rebuilt = await rebuildMaterialIndex();

  let files: SyncFileEntry[];

  if (options?.materialId) {
    if (deletedIds.has(options.materialId)) {
      return {
        pulled: 0,
        message: `素材 ${options.materialId} 已标记删除，跳过拉取`,
      };
    }
    files = listSyncFilesForMaterialIds([options.materialId]);
  } else {
    files = await discoverRemoteSyncFiles(creds, deletedIds);
  }

  let pulled = 0;
  const errors: string[] = [];
  for (const entry of files) {
    try {
      if (await pullFile(creds, entry, deletedIds)) pulled++;
    } catch (err) {
      errors.push(
        `${entry.repoPath}: ${err instanceof Error ? err.message : "pull failed"}`
      );
    }
  }

  const afterDeletedIds = await getDeletedMaterialIds();
  await purgeLocalDeletedMaterials(afterDeletedIds);

  const afterRebuild = await rebuildMaterialIndex();

  const parts = [`已从 GitHub 拉取 ${pulled} 个更新文件`];
  if (rebuilt.recovered > 0 || afterRebuild.recovered > 0) {
    parts.push(
      `本地 index 已恢复 ${Math.max(rebuilt.recovered, afterRebuild.recovered)} 条`
    );
  }
  parts.push(`index 共 ${afterRebuild.total} 个素材`);
  if (errors.length) {
    parts.push(`跳过 ${errors.length} 个失败文件`);
  }

  return { pulled, message: parts.join("；"), errors: errors.slice(0, 5) };
}

export async function pullMaterialFromGitHub(
  materialId: string
): Promise<{ pulled: number; message: string }> {
  return pullLearningData({ materialId });
}
