import { createRequire } from "module";
import fs from "fs";
import path from "path";

const require = createRequire(import.meta.url);

type KuroshiroInstance = {
  init: (analyzer: unknown) => Promise<void>;
  convert: (
    text: string,
    options: { mode: string; to: string }
  ) => Promise<string>;
};

let ready: Promise<KuroshiroInstance> | null = null;

function resolveKuromojiDictPath(): string {
  const analyzerEntry = require.resolve("kuroshiro-analyzer-kuromoji");
  const analyzerDir = path.dirname(analyzerEntry);
  const candidates = [
    // pnpm: .../node_modules/kuromoji/dict（与 analyzer 同级）
    path.join(analyzerDir, "../../kuromoji/dict"),
    path.join(analyzerDir, "../kuromoji/dict"),
    path.join(analyzerDir, "../../../kuromoji/dict"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "base.dat.gz"))) {
      return candidate;
    }
  }
  throw new Error(
    `kuromoji dict not found. tried: ${candidates.join(" | ")}`
  );
}

function getKuroshiro(): Promise<KuroshiroInstance> {
  if (!ready) {
    ready = (async () => {
      const KuroshiroMod = require("kuroshiro");
      const KuromojiAnalyzer = require("kuroshiro-analyzer-kuromoji");
      const Kuroshiro = KuroshiroMod.default ?? KuroshiroMod;
      const instance = new Kuroshiro() as KuroshiroInstance;
      await instance.init(
        new KuromojiAnalyzer({ dictPath: resolveKuromojiDictPath() })
      );
      return instance;
    })();
  }
  return ready;
}

/** 转义后再注音，避免原文中的 HTML 注入 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 汉字上方标注平假名（furigana HTML） */
export async function toFuriganaHiragana(text: string): Promise<string> {
  if (!text.trim()) return text;
  const kuroshiro = await getKuroshiro();
  return kuroshiro.convert(escapeHtml(text), {
    mode: "furigana",
    to: "hiragana",
  });
}
