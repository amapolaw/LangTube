import fs from "fs";
import path from "path";
import { getUserDir } from "./paths";

const LANG_PAIR: Record<string, string> = {
  ja: "ja|zh-CN",
  en: "en|zh-CN",
  es: "es|zh-CN",
  fr: "fr|zh-CN",
  de: "de|zh-CN",
  ko: "ko|zh-CN",
};

const LINGVA_INSTANCES = [
  "https://lingva.ml",
  "https://translate.plausibility.cloud",
  "https://lingva.garudalinux.org",
];

const LINGVA_LANG: Record<string, string> = {
  en: "en",
  es: "es",
  fr: "fr",
  de: "de",
  ja: "ja",
  ko: "ko",
};

const YOUDAO_LANG: Record<string, string> = {
  en: "eng",
  es: "es",
  fr: "fr",
  de: "de",
  ja: "jp",
  ko: "ko",
};

type TranslateCache = Record<string, string>;

function langPair(sourceLang: string): string {
  return LANG_PAIR[sourceLang] ?? `${sourceLang}|zh-CN`;
}

function cacheKey(sourceLang: string, text: string): string {
  return `${sourceLang}:${text.trim().toLowerCase()}`;
}

function readTranslateCache(): TranslateCache {
  const filePath = path.join(getUserDir(), "translate-cache.json");
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as TranslateCache;
  } catch {
    return {};
  }
}

function writeTranslateCacheEntry(key: string, value: string): void {
  const filePath = path.join(getUserDir(), "translate-cache.json");
  const cache = readTranslateCache();
  cache[key] = value;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
  } catch {
    /* ignore cache write errors */
  }
}

export function hasChineseText(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function isLikelySingleWord(text: string, sourceLang: string): boolean {
  const t = text.trim();
  if (!t || t.length > 48) return false;
  if (sourceLang === "en") return /^[a-zA-Z][a-zA-Z'-]*$/.test(t);
  if (sourceLang === "es" || sourceLang === "fr" || sourceLang === "de") {
    return !/\s/.test(t) && t.length <= 32;
  }
  return !/\s/.test(t) && t.length <= 24;
}

function normalizeYoudaoGloss(explain: string): string | null {
  const cleaned = explain
    .replace(/^[\w.]+\s+/, "")
    .split(/[;；]/)[0]
    .replace(/\([^)]*\)/g, "")
    .trim()
    .slice(0, 80);
  return cleaned && hasChineseText(cleaned) ? cleaned : null;
}

/** 有道词典 suggest（英/西/法等单词释义，国内可用） */
async function translateWordWithYoudao(
  word: string,
  sourceLang: string
): Promise<string | null> {
  const le = YOUDAO_LANG[sourceLang];
  if (!le) return null;

  try {
    const url = `https://dict.youdao.com/suggest?num=1&ver=3.0&doctype=json&cache=false&le=${le}&q=${encodeURIComponent(word.trim().slice(0, 80))}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LangTube/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { entries?: { entry?: string; explain?: string }[] };
    };
    const explain = data.data?.entries?.[0]?.explain;
    if (!explain) return null;
    return normalizeYoudaoGloss(explain);
  } catch {
    return null;
  }
}

async function translateWithMyMemory(
  text: string,
  sourceLang: string
): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 450))}&langpair=${langPair(sourceLang)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      responseData?: { translatedText?: string };
    };
    const out = data.responseData?.translatedText?.trim();
    if (!out || /MYMEMORY WARNING/i.test(out)) return null;
    if (!hasChineseText(out)) return null;
    return out;
  } catch {
    return null;
  }
}

async function translateWithLingva(
  text: string,
  sourceLang: string
): Promise<string | null> {
  const src = LINGVA_LANG[sourceLang] ?? sourceLang;
  const snippet = text.slice(0, 400);
  const encoded = encodeURIComponent(snippet);

  for (const base of LINGVA_INSTANCES) {
    try {
      const res = await fetch(`${base}/api/v1/${src}/zh/${encoded}`, {
        signal: AbortSignal.timeout(10000),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { translation?: string };
      const out = data.translation?.trim();
      if (out && hasChineseText(out)) return out;
    } catch {
      continue;
    }
  }
  return null;
}

/** Google Translate 非官方 gtx 端点（短句备用） */
async function translateWithGtx(
  text: string,
  sourceLang: string
): Promise<string | null> {
  const sl = sourceLang === "zh" ? "zh-CN" : sourceLang;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=zh-CN&dt=t&q=${encodeURIComponent(text.slice(0, 400))}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LangTube/1.0)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    const rows = data as [string, ...unknown[]][] | undefined;
    const out = rows
      ?.map((row) => (Array.isArray(row) ? row[0] : ""))
      .filter(Boolean)
      .join("")
      .trim();
    if (out && hasChineseText(out)) return out;
  } catch {
    /* ignore */
  }
  return null;
}

/** MyMemory 免费额度是否已用尽（仅作日志探测，translateToZh 仍会走备用源） */
export async function isMyMemoryQuotaExhausted(
  sourceLang: string
): Promise<boolean> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent("hello")}&langpair=${langPair(sourceLang)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      responseData?: { translatedText?: string };
    };
    const out = data.responseData?.translatedText ?? "";
    return /MYMEMORY WARNING/i.test(out);
  } catch {
    return false;
  }
}

/**
 * 多源翻译到中文：
 * 单词：有道词典 → MyMemory → Lingva → gtx
 * 句子：MyMemory → Lingva → gtx
 */
export async function translateToZh(
  text: string,
  sourceLang: string
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed || hasChineseText(trimmed)) return trimmed || null;

  const key = cacheKey(sourceLang, trimmed);
  const cached = readTranslateCache()[key];
  if (cached && hasChineseText(cached)) return cached;

  let result: string | null = null;

  if (isLikelySingleWord(trimmed, sourceLang)) {
    result = await translateWordWithYoudao(trimmed, sourceLang);
  }

  if (!result) result = await translateWithMyMemory(trimmed, sourceLang);
  if (!result) result = await translateWithLingva(trimmed, sourceLang);
  if (!result && ["en", "es", "fr", "de"].includes(sourceLang)) {
    result = await translateWithGtx(trimmed, sourceLang);
  }

  if (result) {
    writeTranslateCacheEntry(key, result);
  }

  return result;
}
