import fs from "fs";
import { Cursor, JsonlLocalAgentStore } from "@cursor/sdk";
import { getCursorAgentStoreDir } from "@/lib/paths";

let configured = false;

/** Node < 22.13 无 node:sqlite 时，用 JSONL 存储恢复 Cursor SDK 本地 Agent */
export function ensureCursorSdkStore(): void {
  if (configured) return;
  const storeDir = getCursorAgentStoreDir();
  fs.mkdirSync(storeDir, { recursive: true });
  Cursor.configure({
    local: {
      store: new JsonlLocalAgentStore(storeDir),
    },
  });
  configured = true;
}
