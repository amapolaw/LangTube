import fs from "fs/promises";
import path from "path";
import type {
  ContentPack,
  MaterialIndex,
  MaterialManifest,
  Transcript,
  Segments,
  DrillsPack,
  StorageConfig,
  UserSettings,
  UserProfile,
} from "@langtube/core";
import {
  getDataDir,
  getIndexPath,
  getMaterialDir,
  getMaterialsDir,
  getSettingsPath,
  getProfilePath,
} from "./paths";

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readIndex(): Promise<MaterialIndex> {
  try {
    const raw = await fs.readFile(getIndexPath(), "utf-8");
    return JSON.parse(raw) as MaterialIndex;
  } catch {
    return { version: 1, materials: [] };
  }
}

export async function writeIndex(index: MaterialIndex): Promise<void> {
  await ensureDir(getDataDir());
  await fs.writeFile(getIndexPath(), JSON.stringify(index, null, 2));
}

export async function readManifest(id: string): Promise<MaterialManifest | null> {
  try {
    const raw = await fs.readFile(
      path.join(getMaterialDir(id), "manifest.json"),
      "utf-8"
    );
    return JSON.parse(raw) as MaterialManifest;
  } catch {
    return null;
  }
}

export async function readTranscript(id: string): Promise<Transcript | null> {
  try {
    const raw = await fs.readFile(
      path.join(getMaterialDir(id), "transcript.json"),
      "utf-8"
    );
    return JSON.parse(raw) as Transcript;
  } catch {
    return null;
  }
}

export async function readSegments(id: string): Promise<Segments | null> {
  try {
    const raw = await fs.readFile(
      path.join(getMaterialDir(id), "segments.json"),
      "utf-8"
    );
    return JSON.parse(raw) as Segments;
  } catch {
    return null;
  }
}

export async function readDrills(id: string): Promise<DrillsPack | null> {
  try {
    const raw = await fs.readFile(
      path.join(getMaterialDir(id), "drills.json"),
      "utf-8"
    );
    return JSON.parse(raw) as DrillsPack;
  } catch {
    return null;
  }
}

export async function readStorage(id: string): Promise<StorageConfig | null> {
  try {
    const raw = await fs.readFile(
      path.join(getMaterialDir(id), "storage.json"),
      "utf-8"
    );
    return JSON.parse(raw) as StorageConfig;
  } catch {
    return null;
  }
}

export async function readContentPack(id: string): Promise<ContentPack | null> {
  const manifest = await readManifest(id);
  const transcript = await readTranscript(id);
  if (!manifest || !transcript) return null;

  const segments = (await readSegments(id)) ?? manifest.segments;
  const storage = (await readStorage(id)) ?? manifest.storage;
  const drills = (await readDrills(id)) ?? undefined;

  return { manifest, transcript, segments, drills, storage };
}

export async function saveContentPack(pack: ContentPack): Promise<void> {
  const dir = getMaterialDir(pack.manifest.id);
  await ensureDir(dir);

  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(pack.manifest, null, 2)
  );
  await fs.writeFile(
    path.join(dir, "transcript.json"),
    JSON.stringify(pack.transcript, null, 2)
  );
  await fs.writeFile(
    path.join(dir, "segments.json"),
    JSON.stringify(pack.segments, null, 2)
  );
  await fs.writeFile(
    path.join(dir, "storage.json"),
    JSON.stringify(pack.storage, null, 2)
  );
  if (pack.drills) {
    await fs.writeFile(
      path.join(dir, "drills.json"),
      JSON.stringify(pack.drills, null, 2)
    );
  }

  const index = await readIndex();
  const { mergeIndexEntry } = await import("@langtube/core");
  await writeIndex(mergeIndexEntry(index, pack.manifest));
}

export async function readSettings(): Promise<UserSettings> {
  try {
    const raw = await fs.readFile(getSettingsPath(), "utf-8");
    return JSON.parse(raw) as UserSettings;
  } catch {
    return {
      targetLang: "ja",
      nativeLang: "zh",
      level: "N3",
      learningGoal: "general",
      dailyReviewLimit: 50,
    };
  }
}

export async function writeSettings(settings: UserSettings): Promise<void> {
  await ensureDir(path.dirname(getSettingsPath()));
  await fs.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2));
}

export async function readProfile(): Promise<UserProfile> {
  try {
    const raw = await fs.readFile(getProfilePath(), "utf-8");
    return JSON.parse(raw) as UserProfile;
  } catch {
    return {
      targetLang: "ja",
      level: "N3",
      strengths: [],
      weaknesses: [],
    };
  }
}

export async function writeProfile(profile: UserProfile): Promise<void> {
  await ensureDir(path.dirname(getProfilePath()));
  await fs.writeFile(getProfilePath(), JSON.stringify(profile, null, 2));
}

export async function listMaterialIds(): Promise<string[]> {
  try {
    const entries = await fs.readdir(getMaterialsDir(), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function saveUploadedFile(
  materialId: string,
  filename: string,
  buffer: Buffer
): Promise<string> {
  const mediaDir = path.join(getMaterialDir(materialId), "media");
  await ensureDir(mediaDir);
  const filePath = path.join(mediaDir, filename);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export async function deleteMaterial(id: string): Promise<boolean> {
  const dir = getMaterialDir(id);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    return false;
  }
  const index = await readIndex();
  index.materials = index.materials.filter((m) => m.id !== id);
  await writeIndex(index);
  return true;
}
