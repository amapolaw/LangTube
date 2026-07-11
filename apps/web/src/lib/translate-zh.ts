const LANG_PAIR: Record<string, string> = {
  ja: "ja|zh-CN",
  en: "en|zh-CN",
  es: "es|zh-CN",
  fr: "fr|zh-CN",
  de: "de|zh-CN",
  ko: "ko|zh-CN",
};

function langPair(sourceLang: string): string {
  return LANG_PAIR[sourceLang] ?? `${sourceLang}|zh-CN`;
}

export function hasChineseText(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/** MyMemory 免费额度是否已用尽（规则兜底批量翻译前探测） */
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
 * MyMemory 免费翻译（规则兜底用，LLM 不可用时补齐中文）
 */
export async function translateToZh(
  text: string,
  sourceLang: string
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed || hasChineseText(trimmed)) return trimmed || null;

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed.slice(0, 450))}&langpair=${langPair(sourceLang)}`;
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
