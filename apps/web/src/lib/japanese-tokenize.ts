import { createRequire } from "module";
import fs from "fs";
import path from "path";

const require = createRequire(import.meta.url);

type KuromojiToken = {
  surface_form: string;
  pos: string;
  pos_detail_1: string;
  basic_form: string;
  reading?: string;
};

type Tokenizer = {
  tokenize: (text: string) => KuromojiToken[];
};

let tokenizerPromise: Promise<Tokenizer> | null = null;

function resolveKuromoji(): { kuromoji: { builder: Function }; dictPath: string } {
  const analyzer = require.resolve("kuroshiro-analyzer-kuromoji");
  const fromAnalyzer = createRequire(analyzer);
  let kuromojiMod: { builder: Function };
  try {
    kuromojiMod = require("kuromoji");
  } catch {
    kuromojiMod = fromAnalyzer("kuromoji");
  }

  const kuromojiEntry = fromAnalyzer.resolve("kuromoji");
  const candidates = [
    path.join(path.dirname(kuromojiEntry), "../dict"),
    path.join(path.dirname(kuromojiEntry), "dict"),
    path.join(path.dirname(analyzer), "../../kuromoji/dict"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "base.dat.gz"))) {
      return { kuromoji: kuromojiMod, dictPath: candidate };
    }
  }
  throw new Error(`kuromoji dict not found: ${candidates.join(" | ")}`);
}

function getTokenizer(): Promise<Tokenizer> {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      const { kuromoji, dictPath } = resolveKuromoji();
      kuromoji.builder({ dicPath: dictPath }).build(
        (err: Error | null, tokenizer: Tokenizer) => {
          if (err) reject(err);
          else resolve(tokenizer);
        }
      );
    });
  }
  return tokenizerPromise;
}

const SKIP_POS = new Set(["助詞", "助動詞", "記号", "フィラー"]);
const SKIP_DETAIL = new Set(["数", "非自立"]);

/** 内容词：名词/动词/形容词/副词/外来语等，排除助词助动词 */
export function isContentWordToken(token: KuromojiToken): boolean {
  if (SKIP_POS.has(token.pos)) return false;
  if (SKIP_DETAIL.has(token.pos_detail_1)) return false;
  const surface = token.surface_form;
  if (!surface || surface.length < 1) return false;
  if (/^[ぁ-んー]+$/.test(surface) && surface.length <= 1) return false;
  if (/^[、。！？．，…・「」『』（）()\[\]\s]+$/.test(surface)) return false;
  return ["名詞", "動詞", "形容詞", "形容動詞", "副詞", "連体詞"].includes(
    token.pos
  );
}

export type JaWordToken = {
  word: string;
  reading?: string;
  pos: string;
};

/**
 * 用 kuromoji 分出单词（非句子片段）。
 * 连续名词合并（社会+工学 → 社会工学）；优先 basic_form。
 */
export async function tokenizeJapaneseWords(
  text: string
): Promise<JaWordToken[]> {
  if (!text.trim()) return [];
  try {
    const tokenizer = await getTokenizer();
    const tokens = tokenizer.tokenize(text);
    const merged: KuromojiToken[] = [];

    for (const t of tokens) {
      const prev = merged[merged.length - 1];
      if (
        prev &&
        prev.pos === "名詞" &&
        t.pos === "名詞" &&
        !SKIP_DETAIL.has(prev.pos_detail_1) &&
        !SKIP_DETAIL.has(t.pos_detail_1) &&
        prev.surface_form.length + t.surface_form.length <= 10
      ) {
        prev.surface_form += t.surface_form;
        if (prev.basic_form && prev.basic_form !== "*" && t.basic_form && t.basic_form !== "*") {
          prev.basic_form += t.basic_form;
        } else {
          prev.basic_form = prev.surface_form;
        }
        if (prev.reading && t.reading) prev.reading += t.reading;
        continue;
      }
      merged.push({ ...t });
    }

    const words: JaWordToken[] = [];
    const seen = new Set<string>();

    for (const t of merged) {
      if (!isContentWordToken(t)) continue;
      const word =
        t.basic_form && t.basic_form !== "*" ? t.basic_form : t.surface_form;
      if (word.length > 12) continue;
      if (word.length < 2 && !/[\u4e00-\u9fff]/.test(word)) continue;
      // 过滤万能动词噪声（する alone）若过短
      if (word === "する" || word === "ある" || word === "いる") continue;
      const key = word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      words.push({
        word,
        reading: t.reading,
        pos: t.pos,
      });
    }
    return words;
  } catch {
    return fallbackJapaneseWords(text);
  }
}

function fallbackJapaneseWords(text: string): JaWordToken[] {
  const chunks =
    text
      .split(/[、。！？．，…・「」『』（）()\s]+/)
      .flatMap((s) => s.split(/(?<=[はがをにでとへもやの])(?![\u3040-\u309f])/))
      .map((s) => s.replace(/[はがをにでとへもやのに]$/, ""))
      .filter((s) => s.length >= 2 && s.length <= 8) ?? [];
  const kata = text.match(/[ァ-ヶー]{2,}/g) ?? [];
  const alpha = text.match(/[A-Za-z][A-Za-z0-9-]{1,}/g) ?? [];
  const seen = new Set<string>();
  const out: JaWordToken[] = [];
  for (const w of [...chunks, ...kata, ...alpha]) {
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ word: w, pos: "名詞" });
  }
  return out;
}
