import type { TranscriptLine, SupportedLanguage } from "@langtube/core";

/** 语气词 / 口头禅（不入词汇、句型也不作为学习句） */
const FILLER_EXACT = new Set(
  [
    // en
    "uh",
    "um",
    "erm",
    "hmm",
    "mm",
    "mmm",
    "ah",
    "oh",
    "yeah",
    "yep",
    "yup",
    "nah",
    "huh",
    "wow",
    "ok",
    "okay",
    "alright",
    "right",
    "you know",
    "i mean",
    "sort of",
    "kind of",
    // es
    "eh",
    "este",
    "pues",
    "bueno",
    "vale",
    "sí",
    "si",
    "ajá",
    "mmm",
    // fr
    "euh",
    "ben",
    "hein",
    "bah",
    "oui",
    "non",
    // ja
    "えー",
    "ええと",
    "えっと",
    "あの",
    "あのー",
    "うーん",
    "うん",
    "はい",
    "ええ",
    "あっ",
    "ん",
    "まあ",
    "なんか",
  ].map((s) => s.toLowerCase())
);

const NOISE_LINE_RE =
  /\[?\s*(music|applause|laughter|silence|inaudible|bgm|広告|コマーシャル|オープニング|エンディング|background\s*music|♪|♫)\s*\]?/i;

const AD_RE =
  /\b(sponsored|advertisement|commercial break|subscribe|like and subscribe|チャンネル登録|広告の後に)\b/i;

/** 是否仅为无用语气词行 */
export function isFillerOnlyLine(text: string): boolean {
  const t = text
    .replace(/[.,!?…。"「」『』\-—~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!t) return true;
  if (FILLER_EXACT.has(t)) return true;
  // 重复单个语气词 "um um um"
  const parts = t.split(" ").filter(Boolean);
  if (parts.length <= 3 && parts.every((p) => FILLER_EXACT.has(p))) return true;
  return false;
}

export function isNoiseTranscriptLine(line: TranscriptLine): boolean {
  const text = line.text.trim();
  if (!text) return true;
  if (NOISE_LINE_RE.test(text)) return true;
  if (AD_RE.test(text)) return true;
  if (isFillerOnlyLine(text)) return true;
  // 过短且非日语助词句
  if (text.length <= 1) return true;
  // 字幕时长过长且无实质字符（占位）
  const dur = Math.max(0, line.end - line.start);
  if (dur >= 25 && text.replace(/[\s.,!?…]/g, "").length < 3) return true;
  return false;
}

/** 是否为可学习的完整一句 */
export function isCompleteLearningSentence(
  text: string,
  lang: SupportedLanguage
): boolean {
  const t = text.trim();
  if (!t || isFillerOnlyLine(t)) return false;
  if (NOISE_LINE_RE.test(t) || AD_RE.test(t)) return false;

  if (lang === "ja") {
    if (t.length < 4) return false;
    // 至少含实质假名/汉字
    if (!/[\u3040-\u30ff\u4e00-\u9fff]/.test(t)) return false;
    return true;
  }

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  // 以标点或字母结尾均接受；过碎片段跳过
  return true;
}

/**
 * 解析前清洗字幕：去掉 BGM/广告/无正文/语气词行。
 * 不删除用户原文文件，仅返回用于学习解析的子集。
 */
export function filterTranscriptForLearning(
  lines: TranscriptLine[],
  lang: SupportedLanguage
): {
  kept: TranscriptLine[];
  skipped: number;
  reasons: { musicOrAd: number; filler: number; incomplete: number };
} {
  const reasons = { musicOrAd: 0, filler: 0, incomplete: 0 };
  const kept: TranscriptLine[] = [];

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) {
      reasons.incomplete += 1;
      continue;
    }
    if (NOISE_LINE_RE.test(text) || AD_RE.test(text)) {
      reasons.musicOrAd += 1;
      continue;
    }
    if (isFillerOnlyLine(text)) {
      reasons.filler += 1;
      continue;
    }
    if (!isCompleteLearningSentence(text, lang) && text.length < 8) {
      // 极短碎片跳过；较长但缺标点的口语句仍保留作字幕跟随，句型阶段再甄别
      if (text.split(/\s+/).length <= 2 && lang !== "ja") {
        reasons.incomplete += 1;
        continue;
      }
      if (lang === "ja" && text.length < 3) {
        reasons.incomplete += 1;
        continue;
      }
    }
    kept.push(line);
  }

  return {
    kept,
    skipped: lines.length - kept.length,
    reasons,
  };
}

/** 按时间窗切片字幕（分段解析） */
export function sliceTranscriptByRange(
  lines: TranscriptLine[],
  startSec: number,
  endSec: number
): TranscriptLine[] {
  return lines.filter(
    (l) => l.end > startSec && l.start < endSec && l.start >= startSec - 0.5
  );
}
