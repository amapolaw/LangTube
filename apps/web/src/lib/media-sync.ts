import fs from "fs";
import path from "path";
import type { ContentPack, StorageConfig } from "@langtube/core";
import { getMaterialDir } from "./paths";
import { readSettings } from "./data";
import { getCloudProviders } from "./cloud-providers-service";
import { getBaiduAdapterForProvider } from "./cloud-adapter-factory";

export async function syncMaterialMedia(
  materialId: string,
  pack: ContentPack
): Promise<ContentPack> {
  const sourceUrl = pack.manifest.sourceUrl ?? pack.storage.url;

  // 保留已有本地文件；仅补充 url，勿删 path（否则跨设备同步后无法跟读）
  if (sourceUrl) {
    pack.storage = {
      ...pack.storage,
      mode: pack.storage.path ? "local" : "remote",
      provider: pack.storage.provider ?? "local",
      url: sourceUrl,
    };
    if (!pack.manifest.sourceUrl) {
      pack.manifest.sourceUrl = sourceUrl;
    }
    return pack;
  }

  if (pack.storage.mode === "remote" && pack.storage.fileId) {
    return pack;
  }

  const localPath = pack.storage.path;
  if (!localPath || !fs.existsSync(localPath)) {
    return pack;
  }

  const settings = await readSettings();
  const providers = getCloudProviders();
  const connected = providers.find((p) => p.connected);
  if (!connected) {
    return pack;
  }

  try {
    if (connected.type === "baidu") {
      const adapter = getBaiduAdapterForProvider(connected.id);
      const remoteName = `langtube/${materialId}/${path.basename(localPath)}`;
      const uploaded = await adapter.upload(localPath, remoteName);
      pack.storage = {
        mode: "remote",
        provider: "baidu",
        fileId: uploaded.fileId,
        url: uploaded.url,
      };
      delete pack.storage.path;
      return pack;
    }

    if (connected.type === "gdrive") {
      pack.storage = {
        mode: "remote",
        provider: "gdrive",
        url: settings.githubRepo
          ? undefined
          : pack.storage.url,
        path: undefined,
        fileId: pack.storage.fileId,
      };
    }
  } catch (err) {
    console.warn(`Media cloud upload skipped for ${materialId}:`, err);
  }

  return pack;
}

export function getLocalMediaFiles(materialId: string): string[] {
  const mediaDir = path.join(getMaterialDir(materialId), "media");
  if (!fs.existsSync(mediaDir)) return [];
  return fs
    .readdirSync(mediaDir)
    .map((f) => path.join(mediaDir, f))
    .filter((f) => fs.statSync(f).isFile());
}

export function prepareStorageForRemote(
  storage: StorageConfig,
  materialId: string
): StorageConfig {
  if (storage.url) {
    return { mode: "remote", provider: storage.provider, url: storage.url };
  }
  if (storage.fileId) {
    return {
      mode: "remote",
      provider: storage.provider,
      fileId: storage.fileId,
      url: storage.url,
    };
  }
  if (storage.path) {
    return {
      mode: "local",
      provider: "local",
      path: `materials/${materialId}/media/${path.basename(storage.path)}`,
    };
  }
  return storage;
}
