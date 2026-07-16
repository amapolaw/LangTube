import type { ContentPack } from "@langtube/core";
import { hasDisplayableGrammar } from "@/lib/pattern-grammar";

function hasChineseText(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function hasMeaningfulZh(
  word: string,
  zh?: string,
  nativeLang: string = "zh"
): boolean {
  const t = zh?.trim();
  if (!t || t === word) return false;
  if (nativeLang === "zh") return hasChineseText(t);
  return true;
}

/**
 * 听辨就绪：有跟随字幕即可（词汇/句型改为按需点选解析，不再作为就绪门槛）。
 */
export function isPackContentReady(pack: ContentPack): boolean {
  return (pack.transcript.lines?.length ?? 0) > 0;
}

/** 是否已有可用的按需词汇条目 */
export function hasParsedVocabulary(pack: ContentPack): boolean {
  const nativeLang = pack.manifest.nativeLang ?? "zh";
  return pack.manifest.vocabulary.some((v) =>
    hasMeaningfulZh(v.word, v.zh, nativeLang)
  );
}

/** 是否已有可用的按需句型条目（含具体讲解，或至少有原文句） */
export function hasParsedPatterns(pack: ContentPack): boolean {
  return pack.manifest.patterns.some(
    (p) => Boolean(p.pattern?.trim()) || hasDisplayableGrammar(p.grammar)
  );
}

/** 是否达到 TED 级完整解析（双语字幕 + 词汇中文 + 句型语法）——按需模式下较少使用 */
export function isPackFullyEnriched(pack: ContentPack): boolean {
  if (!isPackContentReady(pack)) return false;
  const lines = pack.transcript.lines;
  const translated = lines.filter((l) => l.translation?.trim()).length;
  const ratio = lines.length ? translated / lines.length : 0;
  return (
    hasParsedVocabulary(pack) &&
    hasParsedPatterns(pack) &&
    (ratio >= 0.3 || translated >= Math.min(10, lines.length))
  );
}
