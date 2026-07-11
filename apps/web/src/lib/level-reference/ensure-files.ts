import fs from "fs";
import path from "path";
import { getDataDir } from "@/lib/paths";
import { EN_CEFR_SEED, ES_CEFR_SEED } from "@/lib/level-reference/cefr-seed";

/** 确保 data/reference 下有 CEFR 等级表（种子 + 可扩展） */
export function ensureCefrLevelFiles() {
  const dir = path.join(getDataDir(), "reference");
  fs.mkdirSync(dir, { recursive: true });

  const enPath = path.join(dir, "en-cefr-levels.json");
  const esPath = path.join(dir, "es-cefr-levels.json");

  if (!fs.existsSync(enPath)) {
    fs.writeFileSync(enPath, JSON.stringify(EN_CEFR_SEED, null, 2));
  } else {
    // merge seed into existing
    try {
      const existing = JSON.parse(fs.readFileSync(enPath, "utf-8")) as Record<
        string,
        string
      >;
      fs.writeFileSync(
        enPath,
        JSON.stringify({ ...EN_CEFR_SEED, ...existing }, null, 2)
      );
    } catch {
      fs.writeFileSync(enPath, JSON.stringify(EN_CEFR_SEED, null, 2));
    }
  }

  if (!fs.existsSync(esPath)) {
    fs.writeFileSync(esPath, JSON.stringify(ES_CEFR_SEED, null, 2));
  } else {
    try {
      const existing = JSON.parse(fs.readFileSync(esPath, "utf-8")) as Record<
        string,
        string
      >;
      fs.writeFileSync(
        esPath,
        JSON.stringify({ ...ES_CEFR_SEED, ...existing }, null, 2)
      );
    } catch {
      fs.writeFileSync(esPath, JSON.stringify(ES_CEFR_SEED, null, 2));
    }
  }
}
