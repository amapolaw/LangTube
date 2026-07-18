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

/** 听辨页点选：保留助词/标点为不可选 span，内容词用 surface 展示、lemma 用于查词 */
export type JaSelectSegment = {
  surface: string;
  lemma: string;
  selectable: boolean;
};

function mergeNounRuns(tokens: KuromojiToken[]): KuromojiToken[] {
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
      if (
        prev.basic_form &&
        prev.basic_form !== "*" &&
        t.basic_form &&
        t.basic_form !== "*"
      ) {
        prev.basic_form += t.basic_form;
      } else {
        prev.basic_form = prev.surface_form;
      }
      if (prev.reading && t.reading) prev.reading += t.reading;
      continue;
    }
    merged.push({ ...t });
  }
  return merged;
}

function lemmaFromToken(t: KuromojiToken): string {
  return t.basic_form && t.basic_form !== "*" ? t.basic_form : t.surface_form;
}

function isSelectableSurface(surface: string, token: KuromojiToken): boolean {
  if (isContentWordToken(token)) return true;
  if (/^[ァ-ヶー]{2,}$/.test(surface)) return true;
  if (/^[A-Za-z][A-Za-z0-9-]{1,}$/.test(surface)) return true;
  return false;
}

/** 将整句拆成可点选的日语单词段（含不可选助词/标点） */
export async function tokenizeJapaneseForSelection(
  text: string
): Promise<JaSelectSegment[]> {
  const raw = text.trim();
  if (!raw) return [];
  try {
    const tokenizer = await getTokenizer();
    const merged = mergeNounRuns(tokenizer.tokenize(raw));
    return merged.map((t) => {
      const surface = t.surface_form;
      return {
        surface,
        lemma: lemmaFromToken(t),
        selectable: isSelectableSurface(surface, t),
      };
    });
  } catch {
    return fallbackJapaneseForSelection(raw);
  }
}

function fallbackJapaneseForSelection(text: string): JaSelectSegment[] {
  const raw = text.replace(/\s+/g, "").trim();
  if (!raw) return [];

  const chunks = raw.split(
    /(?=[はがをにでとへもやかなねよわさ])|(?<=[はがをにでとへもや])|(?<=て)|(?<=で)|(?<=っ)/
  ).filter(Boolean);

  if (chunks.length <= 1) {
    const parts =
      raw.match(
        /[\u3040-\u30ff\u4e00-\u9fff々〆ヶー]+|[A-Za-z0-9]+|[^\s]/g
      ) ?? [];
    return parts.map((surface) => ({
      surface,
      lemma: surface.replace(/[てで]$/, "る").replace(/っ$/, "") || surface,
      selectable:
        /[\u3040-\u30ff\u4e00-\u9fffA-Za-z]/.test(surface) &&
        !/^[はがをにでとへもやかなねよわさの？?！!、。．，…]+$/.test(surface),
    }));
  }

  return chunks.map((surface) => ({
    surface,
    lemma: surface.replace(/[てで]$/, "る").replace(/っ$/, "") || surface,
    selectable:
      /[\u3040-\u30ff\u4e00-\u9fffA-Za-z]/.test(surface) &&
      !/^[はがをにでとへもやかなねよわさの？?！!、。．，…]+$/.test(surface) &&
      surface.length >= 1,
  }));
}

/** 从 surface 形还原字典型（basic_form） */
export async function resolveJapaneseLemma(surface: string): Promise<{
  lemma: string;
  reading?: string;
  partOfSpeech?: string;
}> {
  const raw = surface.trim();
  if (!raw) return { lemma: raw };
  try {
    const tokenizer = await getTokenizer();
    const merged = mergeNounRuns(tokenizer.tokenize(raw));
    if (merged.length === 1) {
      const t = merged[0];
      return {
        lemma: lemmaFromToken(t),
        reading: t.reading,
        partOfSpeech: t.pos,
      };
    }
    const exact = merged.find((t) => t.surface_form === raw);
    if (exact) {
      return {
        lemma: lemmaFromToken(exact),
        reading: exact.reading,
        partOfSpeech: exact.pos,
      };
    }
    const content = merged.filter((t) => isContentWordToken(t));
    if (content.length === 1) {
      const t = content[0];
      return {
        lemma: lemmaFromToken(t),
        reading: t.reading,
        partOfSpeech: t.pos,
      };
    }
  } catch {
    /* fallback below */
  }
  const words = await tokenizeJapaneseWords(raw);
  if (words.length === 1) {
    return {
      lemma: words[0].word,
      reading: words[0].reading,
      partOfSpeech: words[0].pos,
    };
  }
  return { lemma: raw };
}

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
    const merged = mergeNounRuns(tokens);

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
  const raw = text.replace(/\s+/g, "").trim();
  const chunks = raw.split(
    /(?=[はがをにでとへもやかなねよわさ])|(?<=[はがをにでとへもや])|(?<=て)|(?<=で)|(?<=っ)/
  ).filter(Boolean);
  const pieces =
    chunks.length > 1
      ? chunks
      : (raw
          .split(/[、。！？．，…・「」『』（）()\s]+/)
          .flatMap((s) =>
            s.split(/(?<=[はがをにでとへもやの])(?![\u3040-\u309f])/)
          )
          .map((s) => s.replace(/[はがをにでとへもやのに]$/, ""))
          .filter((s) => s.length >= 2 && s.length <= 12) ?? []);
  const kata = text.match(/[ァ-ヶー]{2,}/g) ?? [];
  const alpha = text.match(/[A-Za-z][A-Za-z0-9-]{1,}/g) ?? [];
  const seen = new Set<string>();
  const out: JaWordToken[] = [];
  for (const w of [...pieces, ...kata, ...alpha]) {
    const normalized = w.replace(/[てで]$/, "る").replace(/っ$/, "") || w;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    if (/^[はがをにでとへもやかなねよわさの]+$/.test(w)) continue;
    seen.add(key);
    out.push({ word: normalized, pos: "名詞" });
  }
  return out;
}
