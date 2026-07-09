import path from "path";

export function getDataDir(): string {
  return (
    process.env.LANGTUBE_DATA_DIR ??
    path.join(process.cwd(), "..", "..", "data")
  );
}

export function getMaterialsDir(): string {
  return path.join(getDataDir(), "materials");
}

export function getMaterialDir(id: string): string {
  return path.join(getMaterialsDir(), id);
}

export function getUserDir(): string {
  return path.join(getDataDir(), "user");
}

export function getIndexPath(): string {
  return path.join(getDataDir(), "index.json");
}

export function getDbPath(): string {
  return path.join(getUserDir(), "progress.db");
}

export function getSettingsPath(): string {
  return path.join(getUserDir(), "settings.json");
}

export function getProfilePath(): string {
  return path.join(getUserDir(), "profile.json");
}
