import type { StorageConfig, StorageProvider } from "./types.js";

export interface StorageAdapter {
  provider: StorageProvider;
  getMediaUrl(config: StorageConfig): Promise<string>;
  upload(localPath: string, remotePath: string): Promise<StorageConfig>;
  download(config: StorageConfig, localPath: string): Promise<string>;
  listFiles?(folderId?: string): Promise<{ id: string; name: string }[]>;
}

export class LocalStorageAdapter implements StorageAdapter {
  provider: StorageProvider = "local";

  async getMediaUrl(config: StorageConfig): Promise<string> {
    if (!config.path) throw new Error("Local storage path required");
    return `/api/media?path=${encodeURIComponent(config.path)}`;
  }

  async upload(localPath: string, remotePath: string): Promise<StorageConfig> {
    return { mode: "local", provider: "local", path: remotePath || localPath };
  }

  async download(config: StorageConfig, localPath: string): Promise<string> {
    return config.path ?? localPath;
  }
}

export class GoogleDriveAdapter implements StorageAdapter {
  provider: StorageProvider = "gdrive";
  private accessToken?: string;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  async getMediaUrl(config: StorageConfig): Promise<string> {
    if (!config.fileId) throw new Error("Google Drive fileId required");
    return `/api/cloud/gdrive/stream?fileId=${config.fileId}`;
  }

  async upload(_localPath: string, remotePath: string): Promise<StorageConfig> {
    return { mode: "remote", provider: "gdrive", fileId: remotePath };
  }

  async download(config: StorageConfig, localPath: string): Promise<string> {
    if (!this.accessToken || !config.fileId) {
      throw new Error("Google Drive auth and fileId required");
    }
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${config.fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );
    if (!res.ok) throw new Error(`Drive download failed: ${res.statusText}`);
    return localPath;
  }

  async listFiles(folderId?: string): Promise<{ id: string; name: string }[]> {
    if (!this.accessToken) throw new Error("Google Drive auth required");
    const q = folderId
      ? `'${folderId}' in parents`
      : "mimeType contains 'video/' or mimeType contains 'audio/'";
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );
    if (!res.ok) throw new Error(`Drive list failed: ${res.statusText}`);
    const data = (await res.json()) as { files: { id: string; name: string }[] };
    return data.files;
  }
}

export class BaiduPanAdapter implements StorageAdapter {
  provider: StorageProvider = "baidu";
  private accessToken?: string;
  private bduss?: string;
  private stoken?: string;
  private cookies?: string;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  setSession(secrets: { bduss?: string; stoken?: string; cookies?: string; accessToken?: string }) {
    this.bduss = secrets.bduss;
    this.stoken = secrets.stoken;
    this.cookies = secrets.cookies;
    if (secrets.accessToken) this.accessToken = secrets.accessToken;
  }

  private getAuthHeaders(): Record<string, string> {
    if (this.bduss) {
      const parts = [`BDUSS=${this.bduss}`];
      if (this.stoken) parts.push(`STOKEN=${this.stoken}`);
      return { Cookie: parts.join("; ") };
    }
    if (this.cookies) return { Cookie: this.cookies };
    if (this.accessToken) return { Authorization: `Bearer ${this.accessToken}` };
    throw new Error("Baidu Pan auth required");
  }

  async getMediaUrl(config: StorageConfig): Promise<string> {
    if (!config.fileId) throw new Error("Baidu Pan fs_id required");
    return `/api/cloud/baidu/stream?fsId=${config.fileId}`;
  }

  async upload(_localPath: string, remotePath: string): Promise<StorageConfig> {
    return { mode: "remote", provider: "baidu", fileId: remotePath };
  }

  async download(config: StorageConfig, _localPath: string): Promise<string> {
    if (!config.fileId) throw new Error("Baidu Pan fs_id required");
    this.getAuthHeaders();
    return config.fileId;
  }

  async listFiles(folderId?: string): Promise<{ id: string; name: string }[]> {
    const headers = this.getAuthHeaders();
    const dir = folderId ?? "/";
    const params = new URLSearchParams({
      method: "list",
      dir,
      web: "web",
      page: "1",
      num: "100",
      order: "name",
    });
    const res = await fetch(
      `https://pan.baidu.com/api/list?${params}`,
      { headers: { ...headers, "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) throw new Error(`Baidu list failed: ${res.statusText}`);
    const data = (await res.json()) as {
      errno: number;
      list?: { fs_id: number; server_filename: string }[];
    };
    if (data.errno !== 0) throw new Error(`Baidu list error: errno ${data.errno}`);
    return (data.list ?? []).map((f) => ({
      id: String(f.fs_id),
      name: f.server_filename,
    }));
  }
}

export function getStorageAdapter(provider: StorageProvider): StorageAdapter {
  switch (provider) {
    case "gdrive":
      return new GoogleDriveAdapter();
    case "baidu":
      return new BaiduPanAdapter();
    case "quark":
    case "custom":
      return new BaiduPanAdapter();
    default:
      return new LocalStorageAdapter();
  }
}
