import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { getDeletionsPath } from "@/lib/paths";

export interface DeletionsRegistry {
  version: 1;
  /** materialId -> ISO 删除时间 */
  materials: Record<string, string>;
}

const EMPTY: DeletionsRegistry = { version: 1, materials: {} };

export function materialIdFromRepoPath(repoPath: string): string | null {
  const material = repoPath.match(/^data\/materials\/([^/]+)\//);
  if (material) return material[1];
  const task = repoPath.match(/^data\/agent-tasks\/(.+)\.json$/);
  if (task) return task[1];
  return null;
}

export function isDeletedMaterialPath(
  repoPath: string,
  deletedIds: Set<string>
): boolean {
  const id = materialIdFromRepoPath(repoPath);
  return id !== null && deletedIds.has(id);
}

export async function readDeletionsRegistry(): Promise<DeletionsRegistry> {
  const filePath = getDeletionsPath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as DeletionsRegistry;
    if (parsed?.version === 1 && parsed.materials) return parsed;
  } catch {
    // missing or invalid
  }
  return { ...EMPTY, materials: {} };
}

export async function writeDeletionsRegistry(
  registry: DeletionsRegistry
): Promise<void> {
  const filePath = getDeletionsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(registry, null, 2) + "\n");
}

export function mergeDeletionsRegistries(
  local: DeletionsRegistry,
  remote: DeletionsRegistry
): DeletionsRegistry {
  const materials: Record<string, string> = { ...remote.materials };
  for (const [id, ts] of Object.entries(local.materials)) {
    const existing = materials[id];
    if (!existing || new Date(ts).getTime() >= new Date(existing).getTime()) {
      materials[id] = ts;
    }
  }
  return { version: 1, materials };
}

export async function getDeletedMaterialIds(): Promise<Set<string>> {
  const registry = await readDeletionsRegistry();
  return new Set(Object.keys(registry.materials));
}

export async function recordMaterialDeletion(materialId: string): Promise<void> {
  const registry = await readDeletionsRegistry();
  registry.materials[materialId] = new Date().toISOString();
  await writeDeletionsRegistry(registry);
}

export function readDeletionsRegistrySync(): DeletionsRegistry {
  const filePath = getDeletionsPath();
  if (!fsSync.existsSync(filePath)) return { version: 1, materials: {} };
  try {
    const raw = fsSync.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as DeletionsRegistry;
    if (parsed?.version === 1 && parsed.materials) return parsed;
  } catch {
    // ignore
  }
  return { version: 1, materials: {} };
}
