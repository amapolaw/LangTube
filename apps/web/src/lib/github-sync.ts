import fs from "fs";
import path from "path";
import { readSettings } from "@/lib/data";
import {
  listSyncFiles,
  listSyncFilesForMaterialIds,
  buildSyncEntry,
  readFileForSync,
  type SyncFileEntry,
} from "@/lib/sync-files";
import type { MaterialIndex } from "@langtube/core";

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
  return Buffer.from(data.content, "base64").toString("utf-8");
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

function mergeIndexContents(local: string, remote: string): string {
  try {
    const localIndex = JSON.parse(local || '{"version":1,"materials":[]}') as MaterialIndex;
    const remoteIndex = JSON.parse(remote) as MaterialIndex;
    const byId = new Map<string, MaterialIndex["materials"][number]>();

    for (const m of localIndex.materials ?? []) {
      byId.set(m.id, m);
    }
    for (const m of remoteIndex.materials ?? []) {
      const existing = byId.get(m.id);
      if (!existing) {
        byId.set(m.id, m);
        continue;
      }
      const localTs = new Date(existing.updatedAt).getTime();
      const remoteTs = new Date(m.updatedAt).getTime();
      if (Number.isNaN(localTs) || remoteTs >= localTs) {
        byId.set(m.id, m);
      }
    }

    const materials = Array.from(byId.values()).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    const updatedAt = materials[0]?.updatedAt ?? new Date().toISOString();
    return JSON.stringify(
      {
        version: remoteIndex.version ?? localIndex.version ?? 1,
        materials,
        updatedAt,
      },
      null,
      2
    );
  } catch {
    return remote;
  }
}

async function discoverRemoteSyncFiles(
  creds: GitHubCredentials
): Promise<SyncFileEntry[]> {
  const entries: SyncFileEntry[] = [buildSyncEntry("data/index.json")];

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

  const agentTaskItems = await listRemoteDirectory(creds, "data/agent-tasks");
  for (const item of agentTaskItems) {
    if (item.type === "file" && item.name.endsWith(".json")) {
      entries.push(buildSyncEntry(`data/agent-tasks/${item.name}`));
    }
  }

  return entries;
}

async function pullFile(
  creds: GitHubCredentials,
  entry: SyncFileEntry
): Promise<boolean> {
  const remoteContent = await fetchRemoteFileContent(creds, entry.repoPath);
  if (remoteContent === null) return false;

  const localExists = fs.existsSync(entry.localPath);
  const localContent = localExists
    ? fs.readFileSync(entry.localPath, "utf-8")
    : "";

  if (entry.repoPath === "data/index.json") {
    const merged = mergeIndexContents(localContent, remoteContent);
    if (merged === localContent) return false;
    fs.mkdirSync(path.dirname(entry.localPath), { recursive: true });
    fs.writeFileSync(entry.localPath, merged);
    return true;
  }

  if (!shouldPreferRemote(localContent, remoteContent, entry.repoPath)) {
    return false;
  }

  fs.mkdirSync(path.dirname(entry.localPath), { recursive: true });
  fs.writeFileSync(entry.localPath, remoteContent);
  return true;
}

export async function pushLearningData(overrides?: {
  repo?: string;
  token?: string;
}): Promise<{
  pushed: number;
  message: string;
}> {
  const creds = await getCredentials(overrides);
  if (!creds) {
    const gap =
      (await describeGitHubConfigGap(overrides)) ??
      "GitHub 未配置，跳过同步";
    return { pushed: 0, message: gap };
  }

  const files = listSyncFiles();
  const message = `langtube sync ${new Date().toISOString()}`;
  let pushed = 0;

  for (const entry of files) {
    await putFile(creds, entry, message);
    pushed++;
  }

  return {
    pushed,
    message: `已推送 ${pushed} 个文件到 ${creds.owner}/${creds.repo}`,
  };
}

export async function pullLearningData(
  options?: {
    materialId?: string;
    repo?: string;
    token?: string;
  }
): Promise<{ pulled: number; message: string }> {
  const creds = await getCredentials(options);
  if (!creds) {
    const gap =
      (await describeGitHubConfigGap(options)) ?? "GitHub 未配置";
    return { pulled: 0, message: gap };
  }

  let files: SyncFileEntry[];

  if (options?.materialId) {
    files = listSyncFilesForMaterialIds([options.materialId]);
    files.push(buildSyncEntry("data/index.json"));
  } else {
    files = await discoverRemoteSyncFiles(creds);
  }

  let pulled = 0;
  for (const entry of files) {
    if (await pullFile(creds, entry)) pulled++;
  }

  return { pulled, message: `已从 GitHub 拉取 ${pulled} 个更新文件` };
}

export async function pullMaterialFromGitHub(
  materialId: string
): Promise<{ pulled: number; message: string }> {
  return pullLearningData({ materialId });
}
