import type { ContentPack } from "@langtube/core";

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

function hasRealGrammar(grammar?: string): boolean {
  const g = grammar?.trim();
  return Boolean(g && g !== "句型");
}

/**
 * 内容就绪判定（对齐 TED 示例）：
 * - 有字幕行
 * - 词汇表：至少若干条带中文释义（≠原文）
 * - 句型：至少若干条带具体语法讲解（≠「句型」）
 * - LLM 模式额外要求：至少部分字幕有中文对照
 * - 规则模式：允许无行级翻译，但词汇/句型质量必须达标
 */
export function isPackContentReady(pack: ContentPack): boolean {
  const lines = pack.transcript.lines;
  if (!lines.length) return false;

  const vocab = pack.manifest.vocabulary;
  const patterns = pack.manifest.patterns;
  if (!vocab.length || !patterns.length) return false;

  const nativeLang = pack.manifest.nativeLang ?? "zh";
  const vocabZh = vocab.filter((v) =>
    hasMeaningfulZh(v.word, v.zh, nativeLang)
  ).length;
  const grammarOk = patterns.filter((p) => hasRealGrammar(p.grammar)).length;

  const minVocabZh = Math.min(3, vocab.length);
  const minGrammar = Math.min(1, patterns.length);
  if (vocabZh < minVocabZh || grammarOk < minGrammar) return false;

  if (pack.manifest.enrichmentMode === "rules") {
    return true;
  }

  // llm / 未标注：要求字幕对照
  const translated = lines.filter((l) => l.translation?.trim()).length;
  return translated >= Math.min(3, lines.length);
}

/** 是否达到 TED 级完整解析（双语字幕 + 词汇中文 + 句型语法） */
export function isPackFullyEnriched(pack: ContentPack): boolean {
  if (!isPackContentReady(pack)) return false;
  const lines = pack.transcript.lines;
  const translated = lines.filter((l) => l.translation?.trim()).length;
  const ratio = lines.length ? translated / lines.length : 0;
  return (
    pack.manifest.enrichmentMode === "llm" &&
    (ratio >= 0.5 || translated >= Math.min(20, lines.length))
  );
}
