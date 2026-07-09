import fs from "fs";
import path from "path";
import type { CloudProviderConfig } from "@langtube/core";
import { getUserDir } from "./paths";
import { randomUUID } from "crypto";

function getProvidersPath() {
  return path.join(getUserDir(), "cloud-providers.json");
}

const BUILTIN_TEMPLATES: CloudProviderConfig[] = [
  {
    id: "gdrive-default",
    name: "Google Drive",
    type: "gdrive",
    builtin: true,
    authType: "oauth2",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: "",
    clientSecret: "",
    redirectUri: "http://localhost:3000/api/cloud/gdrive/callback",
    connected: false,
  },
  {
    id: "baidu-default",
    name: "百度云盘",
    type: "baidu",
    builtin: true,
    authType: "password",
    connected: false,
  },
  {
    id: "quark-template",
    name: "夸克网盘",
    type: "quark",
    builtin: true,
    authType: "password",
    connected: false,
  },
];

function ensureUserDir() {
  const dir = getUserDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getCloudProviders(): CloudProviderConfig[] {
  ensureUserDir();
  const filePath = getProvidersPath();
  if (!fs.existsSync(filePath)) {
    const initial = BUILTIN_TEMPLATES.map((p) => ({ ...p }));
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2));
    return initial;
  }
  const providers = JSON.parse(
    fs.readFileSync(filePath, "utf-8")
  ) as CloudProviderConfig[];
  let changed = false;
  for (const builtin of BUILTIN_TEMPLATES) {
    const idx = providers.findIndex((p) => p.id === builtin.id);
    if (idx >= 0) {
      const expectedAuth =
        builtin.type === "gdrive" ? "oauth2" : ("password" as const);
      if (providers[idx].authType !== expectedAuth) {
        providers[idx].authType = expectedAuth;
        changed = true;
      }
    }
  }
  if (changed) saveCloudProviders(providers);
  return providers;
}

export function saveCloudProviders(providers: CloudProviderConfig[]) {
  ensureUserDir();
  fs.writeFileSync(getProvidersPath(), JSON.stringify(providers, null, 2));
}

export function getCloudProvider(id: string): CloudProviderConfig | undefined {
  return getCloudProviders().find((p) => p.id === id);
}

export function upsertCloudProvider(
  provider: Partial<CloudProviderConfig> & { name: string; type: CloudProviderConfig["type"] }
): CloudProviderConfig {
  const providers = getCloudProviders();
  const id = provider.id ?? `custom-${randomUUID().slice(0, 8)}`;
  const existing = providers.findIndex((p) => p.id === id);
  const defaultAuthType: CloudProviderConfig["authType"] =
    provider.type === "gdrive" ? "oauth2" : "password";

  const entry: CloudProviderConfig = {
    id,
    name: provider.name,
    type: provider.type,
    builtin: provider.builtin ?? false,
    authType: provider.authType ?? defaultAuthType,
    authUrl: provider.authUrl ?? "",
    tokenUrl: provider.tokenUrl ?? "",
    clientId: provider.clientId ?? "",
    clientSecret: provider.clientSecret ?? "",
    redirectUri:
      provider.redirectUri ??
      `http://localhost:3000/api/cloud/custom/callback?providerId=${id}`,
    connected: provider.connected ?? false,
    accessToken: provider.accessToken,
  };
  if (existing >= 0) providers[existing] = { ...providers[existing], ...entry };
  else providers.push(entry);
  saveCloudProviders(providers);
  return entry;
}

export function deleteCloudProvider(id: string) {
  const providers = getCloudProviders().filter((p) => p.id !== id || p.builtin);
  saveCloudProviders(providers);
}

export function setProviderConnected(id: string, connected: boolean, accessToken?: string) {
  const providers = getCloudProviders();
  const idx = providers.findIndex((p) => p.id === id);
  if (idx < 0) return;
  providers[idx].connected = connected;
  if (accessToken) providers[idx].accessToken = accessToken;
  saveCloudProviders(providers);
}

export function resolveProviderCredentials(
  type: CloudProviderConfig["type"],
  providerId?: string
): CloudProviderConfig | null {
  if (providerId) {
    const p = getCloudProvider(providerId);
    if (p?.clientId) return p;
  }
  const providers = getCloudProviders();
  const match = providers.find((p) => p.type === type && p.clientId);
  if (match) return match;

  if (type === "gdrive" && process.env.GDRIVE_CLIENT_ID) {
    return {
      id: "env-gdrive",
      name: "Google Drive",
      type: "gdrive",
      clientId: process.env.GDRIVE_CLIENT_ID,
      clientSecret: process.env.GDRIVE_CLIENT_SECRET ?? "",
      redirectUri:
        process.env.GDRIVE_REDIRECT_URI ??
        "http://localhost:3000/api/cloud/gdrive/callback",
    };
  }
  if (type === "baidu" && process.env.BAIDU_APP_KEY) {
    return {
      id: "env-baidu",
      name: "百度云盘",
      type: "baidu",
      clientId: process.env.BAIDU_APP_KEY,
      clientSecret: process.env.BAIDU_SECRET_KEY ?? "",
      redirectUri:
        process.env.BAIDU_REDIRECT_URI ??
        "http://localhost:3000/api/cloud/baidu/callback",
    };
  }
  return null;
}
