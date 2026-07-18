import type { SupportedLanguage, TranscriptLine } from "@langtube/core";

const ROMANCE_MERGE_LANGS = new Set<SupportedLanguage>(["es", "fr", "en"]);

/** 西语口语：保守的句界（避免把 A qué / misma hora / vamos a qué 拆碎） */
const ES_TEXT_BOUNDARY =
  /(?<=[.!?…])\s+|(?<=\s)(?=Bueno(?:\s+pues|\s+y)?\s|Mira(?:\s+pues)?\s|Vale\s|Entonces\s|Claro\s|Oye\s|Ah\s|y tú\s|Y tú\s|y yo\s|Y yo\s|Para ti\s|Para mí\s|Cuéntame\s|Cuéntanos\s|Dime\s|Normalmente\s|Básicamente\s|La verdad\s|O sea\s|Es decir\s|Pero\s|Hay algo\s|Cuál es\s|Cómo es\s|Por qué\s|Cuándo\s|Dónde\s|Cuál\s|Cuánto\s|Quién\s|Cómo\s|vamos a qué\s|Vamos a qué\s|yo a las\s|yo las\s|me he levantado\s|me levanté\s|estáis listos\s)/gi;

const EN_TEXT_BOUNDARY =
  /(?<=[.!?…])\s+|(?<=\s)(?=Well,?\s|So,?\s|Okay,?\s|Ok,?\s|Yeah,?\s|Yes,?\s|No,?\s|But\s|And\s|Now\s|Then\s|What\s|How\s|When\s|Where\s|Why\s|Who\s)/gi;

const FR_TEXT_BOUNDARY =
  /(?<=[.!?…])\s+|(?<=\s)(?=Bon\s|Bonjour\s|Alors\s|Donc\s|Mais\s|Oui\s|Non\s|Et\s|Eh bien\s|Qu'est-ce\s|Comment\s|Pourquoi\s|Quand\s|Où\s)/gi;

const NOISE_LINE = /^\[[^\]]+\]$/i;

function boundaryRe(lang: SupportedLanguage): RegExp | null {
  if (lang === "es") return ES_TEXT_BOUNDARY;
  if (lang === "en") return EN_TEXT_BOUNDARY;
  if (lang === "fr") return FR_TEXT_BOUNDARY;
  return null;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

type CharSpan = {
  start: number;
  end: number;
  charStart: number;
  charEnd: number;
};

function buildTimedText(lines: TranscriptLine[]): {
  text: string;
  spans: CharSpan[];
} {
  let text = "";
  const spans: CharSpan[] = [];

  for (const line of lines) {
    const chunk = normalizeText(line.text ?? "");
    if (!chunk) continue;
    if (text) text += " ";
    const charStart = text.length;
    text += chunk;
    spans.push({
      start: line.start,
      end: line.end,
      charStart,
      charEnd: text.length,
    });
  }

  return { text, spans };
}

function timeForRange(
  spans: CharSpan[],
  charStart: number,
  charEnd: number
): { start: number; end: number } {
  const hit = spans.filter(
    (s) => s.charEnd > charStart && s.charStart < charEnd
  );
  if (!hit.length) {
    const last = spans[spans.length - 1];
    return { start: last?.start ?? 0, end: last?.end ?? 0 };
  }
  return { start: hit[0]!.start, end: hit[hit.length - 1]!.end };
}

/** 合并过短的碎片（如单独的 y / vamos）到相邻句 */
function coalesceShortFragments(parts: string[], minWords = 4): string[] {
  if (!parts.length) return [];
  const merged: string[] = [];

  for (const part of parts) {
    const p = normalizeText(part);
    if (!p) continue;
    if (NOISE_LINE.test(p)) {
      merged.push(p);
      continue;
    }
    if (wordCount(p) < minWords && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${p}`;
      continue;
    }
    merged.push(p);
  }

  if (merged.length > 1 && wordCount(merged[0]!) < minWords) {
    merged[1] = `${merged[0]} ${merged[1]}`.trim();
    merged.shift();
  }

  return merged;
}

function splitAtBoundaries(text: string, lang: SupportedLanguage): string[] {
  const t = normalizeText(text);
  if (!t) return [];
  const re = boundaryRe(lang);
  if (!re) return [t];

  const raw: string[] = [];
  let last = 0;
  for (const m of t.matchAll(re)) {
    const seg = t.slice(last, m.index).trim();
    if (seg) raw.push(seg);
    last = m.index ?? last;
  }
  const tail = t.slice(last).trim();
  if (tail) raw.push(tail);

  const maxWords = lang === "en" ? 22 : 20;
  const out: string[] = [];
  for (const part of raw.length ? raw : [t]) {
    if (NOISE_LINE.test(part)) {
      out.push(part);
      continue;
    }
    if (wordCount(part) <= maxWords) {
      out.push(part);
      continue;
    }
    // 过长句在逗号式连接词处二次切分
    const soft =
      lang === "es"
        ? /(?<=\s)(?=pero\s|y bueno\s|y queríamos\s|y tú\s|así que\s|porque\s)/gi
        : /(?<=\s)(?=but\s|and\s|so\s|because\s)/gi;
    let subLast = 0;
    let pieces: string[] = [];
    for (const m of part.matchAll(soft)) {
      const seg = part.slice(subLast, m.index).trim();
      if (seg) pieces.push(seg);
      subLast = m.index ?? subLast;
    }
    const subTail = part.slice(subLast).trim();
    if (subTail) pieces.push(subTail);
    if (pieces.length <= 1) {
      out.push(part);
      continue;
    }
    let buf = "";
    for (const piece of pieces) {
      const next = buf ? `${buf} ${piece}` : piece;
      if (wordCount(next) > maxWords && buf) {
        out.push(buf);
        buf = piece;
      } else {
        buf = next;
      }
    }
    if (buf) out.push(buf);
  }

  return coalesceShortFragments(out.filter(Boolean));
}

/**
 * 将碎片字幕行合并为「完整一句一行」。
 * 适用于 B 站/YouTube 自动字幕等无标点断句的场景。
 */
export function mergeTranscriptIntoSentences(
  lines: TranscriptLine[],
  lang: SupportedLanguage
): TranscriptLine[] {
  if (!ROMANCE_MERGE_LANGS.has(lang) || lines.length <= 1) {
    return lines.map((l, i) => ({ ...l, id: l.id || `line-${i + 1}` }));
  }

  const { text, spans } = buildTimedText(lines);
  if (!text) return [];

  const sentences = splitAtBoundaries(text, lang);
  const out: TranscriptLine[] = [];
  let searchFrom = 0;

  for (const sentence of sentences) {
    const idx = text.indexOf(sentence, searchFrom);
    const charStart = idx >= 0 ? idx : searchFrom;
    const charEnd = charStart + sentence.length;
    searchFrom = charEnd;
    const { start, end } = timeForRange(spans, charStart, charEnd);
    out.push({
      id: `line-${out.length + 1}`,
      start,
      end,
      text: sentence,
      translation: "",
    });
  }

  return out;
}

export function shouldMergeTranscriptSentences(lang: SupportedLanguage): boolean {
  return ROMANCE_MERGE_LANGS.has(lang);
}

/** 平均每条字幕词数过低 → 疑似碎片断句 */
export function looksLikeFragmentedTranscript(
  lines: TranscriptLine[],
  lang: SupportedLanguage
): boolean {
  if (!shouldMergeTranscriptSentences(lang) || lines.length < 8) return false;
  const sample = lines.slice(0, Math.min(lines.length, 40));
  const avgWords =
    sample.reduce((n, l) => n + wordCount(l.text ?? ""), 0) / sample.length;
  const shortRatio =
    sample.filter((l) => wordCount(l.text ?? "") <= 5).length / sample.length;
  const punctRatio =
    sample.filter((l) => /[.!?…]$/.test((l.text ?? "").trim())).length /
    sample.length;
  return avgWords < 9 && shortRatio > 0.45 && punctRatio < 0.15;
}
