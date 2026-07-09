import fs from "fs";
import path from "path";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";
import type { CloudSession, CloudSessionSecrets } from "@langtube/core";
import { getUserDir } from "./paths";

function getSessionsPath() {
  return path.join(getUserDir(), "cloud-sessions.json");
}

function getKeyPath() {
  return path.join(getUserDir(), ".session-key");
}

function ensureUserDir() {
  const dir = getUserDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getEncryptionKey(): Buffer {
  const envKey = process.env.LANGTUBE_SESSION_SECRET;
  if (envKey) {
    return scryptSync(envKey, "langtube-salt", 32);
  }
  ensureUserDir();
  const keyPath = getKeyPath();
  if (!fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, randomBytes(32).toString("hex"));
  }
  const raw = fs.readFileSync(keyPath, "utf-8").trim();
  return scryptSync(raw, "langtube-salt", 32);
}

function encryptPayload(payload: unknown): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptPayload<T>(payload: string): T {
  const key = getEncryptionKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}

function encryptSecrets(secrets: CloudSessionSecrets): string {
  return encryptPayload(secrets);
}

function decryptSecrets(payload: string): CloudSessionSecrets {
  return decryptPayload<CloudSessionSecrets>(payload);
}

interface StoredSession {
  providerId: string;
  type: CloudSession["type"];
  authType: CloudSession["authType"];
  username?: string;
  connected: boolean;
  expiresAt?: string;
  encryptedSecrets?: string;
}

function readStore(): Record<string, StoredSession> {
  ensureUserDir();
  try {
    return JSON.parse(
      fs.readFileSync(getSessionsPath(), "utf-8")
    ) as Record<string, StoredSession>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, StoredSession>) {
  ensureUserDir();
  fs.writeFileSync(getSessionsPath(), JSON.stringify(store, null, 2));
}

export function getSession(providerId: string): CloudSession | null {
  const store = readStore();
  const row = store[providerId];
  if (!row) return null;
  return {
    providerId: row.providerId,
    type: row.type,
    authType: row.authType,
    username: row.username,
    connected: row.connected,
    expiresAt: row.expiresAt,
    secrets: row.encryptedSecrets
      ? decryptSecrets(row.encryptedSecrets)
      : undefined,
  };
}

export function getAllSessions(): CloudSession[] {
  const store = readStore();
  return Object.values(store).map((row) => ({
    providerId: row.providerId,
    type: row.type,
    authType: row.authType,
    username: row.username,
    connected: row.connected,
    expiresAt: row.expiresAt,
  }));
}

export function saveSession(
  session: Omit<CloudSession, "secrets"> & { secrets?: CloudSessionSecrets }
): CloudSession {
  const store = readStore();
  const row: StoredSession = {
    providerId: session.providerId,
    type: session.type,
    authType: session.authType,
    username: session.username,
    connected: session.connected,
    expiresAt: session.expiresAt,
    encryptedSecrets: session.secrets
      ? encryptSecrets(session.secrets)
      : undefined,
  };
  store[session.providerId] = row;
  writeStore(store);
  return { ...session, secrets: undefined };
}

export function clearSession(providerId: string) {
  const store = readStore();
  delete store[providerId];
  writeStore(store);
}

export function getSessionSecrets(providerId: string): CloudSessionSecrets | null {
  const session = getSession(providerId);
  return session?.secrets ?? null;
}

export function sealTransientPayload(payload: unknown): string {
  return encryptPayload(payload);
}

export function openTransientPayload<T>(sealed: string): T {
  return decryptPayload<T>(sealed);
}
