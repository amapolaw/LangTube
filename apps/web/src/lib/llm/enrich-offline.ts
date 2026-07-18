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

  const lang = pack.manifest.sourceLang;

  // 日语 / 西语：词汇与句型仅在听辨页点选解析
  if (lang === "ja") {
    pack.manifest.enrichmentMode = "rules";
    return {
      enriched: false,
      message:
        "日语素材：请在听辨页点选单词/句子后解析（与「俺の話は長い 02」一致）",
      mode: "rules",
    };
  }
  if (lang === "es") {
    pack.manifest.enrichmentMode = "rules";
    return {
      enriched: false,
      message:
        "西语素材：请在听辨页点选单词/句子后解析（与 es-coco 一致）",
      mode: "rules",
    };
  }
  if (lang === "fr") {
    pack.manifest.enrichmentMode = "rules";
    return {
      enriched: false,
      message:
        "法语素材：请在听辨页点选单词/句子后解析（与「Le Petit Prince」一致）",
      mode: "rules",
    };
  }

  const vocab = await extractVocabulary(lines, lang);
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
