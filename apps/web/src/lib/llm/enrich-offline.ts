import type { ContentPack } from "@langtube/core";
import {
  extractVocabulary,
  extractPatterns,
  isLikelyWordNotPhrase,
  isBasicSkipWord,
} from "@/lib/vocab-extract";
import { enrichFromReference, type EnrichReferenceOptions } from "@/lib/llm/enrich-from-reference";
import { ensureFullPatterns } from "@/lib/pack-patterns";

export type EnrichmentMode = "llm" | "rules";

/**
 * 无 LLM 时的规则 + 参考资料增强：
 * 分词（单词）→ Language 词库释义 → 句型（原句+中文+语法讲解）
 */
export async function enrichOffline(
  pack: ContentPack,
  referenceOptions?: EnrichReferenceOptions
): Promise<{ enriched: boolean; message: string; mode: EnrichmentMode }> {
  const lines = pack.transcript.lines;
  if (!lines.length) {
    return { enriched: false, message: "无字幕行可增强", mode: "rules" };
  }

  const vocab = await extractVocabulary(lines, pack.manifest.sourceLang);
  pack.manifest.vocabulary = vocab.filter(
    (v) =>
      isLikelyWordNotPhrase(v.word, pack.manifest.sourceLang) &&
      !isBasicSkipWord(v.word, pack.manifest.sourceLang)
  );
  pack.manifest.patterns = extractPatterns(lines, pack.manifest.sourceLang);
  ensureFullPatterns(pack);

  const ref = await enrichFromReference(pack, referenceOptions);
  pack.manifest.enrichmentMode = "rules";

  return {
    enriched:
      pack.manifest.vocabulary.length > 0 &&
      pack.manifest.patterns.length > 0,
    message: [
      `规则模式：${pack.manifest.vocabulary.length} 词汇，${pack.manifest.patterns.length} 句型`,
      ref.message,
    ]
      .filter(Boolean)
      .join("；"),
    mode: "rules",
  };
}
