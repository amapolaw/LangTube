import { COMMON_KANJI_KATAKANA } from "@/lib/common-kanji-katakana";

/** 片假名 → 平假名 */
export function toHiragana(text: string): string {
  return text.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/** 平假名 → 片假名（兼容旧调用） */
export function toKatakana(text: string): string {
  return text.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

export function hasKanji(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

export function isJapaneseText(text: string): boolean {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(text);
}

export interface RubySegment {
  text: string;
  reading?: string; // 平假名
}

/**
 * 将日语句子切成 ruby 片段：汉字词上方标注平假名。
 * readings：词汇表 word → reading（片/平假名均可，统一转平假名）
 * 优先用于离线兜底；完整注音请走 kuroshiro API。
 */
export function annotateJapaneseRuby(
  text: string,
  readings: Map<string, string> | Record<string, string>
): RubySegment[] {
  const map =
    readings instanceof Map
      ? readings
      : new Map(Object.entries(readings));

  const words = [...map.keys()]
    .filter((w) => w && hasKanji(w))
    .sort((a, b) => b.length - a.length);

  const segments: RubySegment[] = [];
  let i = 0;

  while (i < text.length) {
    let matched = false;
    for (const word of words) {
      if (text.startsWith(word, i)) {
        const raw = map.get(word) ?? "";
        const reading = raw
          ? toHiragana(raw.replace(/\s/g, ""))
          : undefined;
        segments.push({
          text: word,
          reading: reading && reading !== word ? reading : undefined,
        });
        i += word.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    if (/[\u4e00-\u9fff]/.test(text[i]!)) {
      let j = i + 1;
      while (j < text.length && /[\u4e00-\u9fff々〆ヵヶ]/.test(text[j]!)) j++;
      const kanjiRun = text.slice(i, j);
      const raw = map.get(kanjiRun) ?? "";
      const reading = raw
        ? toHiragana(raw.replace(/\s/g, ""))
        : undefined;
      segments.push({
        text: kanjiRun,
        reading: reading && reading !== kanjiRun ? reading : undefined,
      });
      i = j;
      continue;
    }

    let j = i + 1;
    while (
      j < text.length &&
      !/[\u4e00-\u9fff]/.test(text[j]!) &&
      !words.some((w) => text.startsWith(w, j))
    ) {
      j++;
    }
    segments.push({ text: text.slice(i, j) });
    i = j;
  }

  return segments;
}

/** 从素材词汇表构建 word → reading（平假名；并合并常用汉字兜底） */
export function buildReadingMap(
  vocabulary: { word: string; reading?: string }[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [word, reading] of Object.entries(COMMON_KANJI_KATAKANA)) {
    map.set(word, toHiragana(reading));
  }
  for (const v of vocabulary) {
    if (v.word && v.reading?.trim()) {
      map.set(v.word, toHiragana(v.reading.trim()));
    }
  }
  return map;
}
