import type {
  ContentPack,
  PatternItem,
  Segments,
  VocabularyItem,
} from "@langtube/core";
import { isPackContentReady } from "@/lib/pack-readiness";
import {
  adaptiveBatchSize,
  ensureFullPatterns,
} from "@/lib/pack-patterns";
import { chatCompletion } from "./client";
import { enrichOffline } from "./enrich-offline";
import { enrichFromReference, type EnrichReferenceOptions } from "./enrich-from-reference";
import {
  extractVocabulary,
  isLikelyWordNotPhrase,
  isBasicSkipWord,
} from "@/lib/vocab-extract";
import { buildEnrichSystemPrompt } from "@/lib/parse-rules";
import { saveContentPack } from "@/lib/data";

interface EnrichBatchResult {
  lines: { id: string; translation: string }[];
  vocabulary: VocabularyItem[];
  patterns: PatternItem[];
  segments?: Segments;
}

export interface EnrichResult {
  enriched: boolean;
  message: string;
  mode?: "llm" | "rules";
}

function extractJson(text: string): EnrichBatchResult {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("LLM 返回非 JSON");
  return JSON.parse(match[0]) as EnrichBatchResult;
}

async function enrichWithLlm(pack: ContentPack): Promise<EnrichResult> {
  const lines = pack.transcript.lines;
  if (!lines.length) {
    return { enriched: false, message: "无字幕行可增强" };
  }

  const systemPrompt = buildEnrichSystemPrompt(pack);

  const allVocab: VocabularyItem[] = [];
  const allPatterns: PatternItem[] = [];
  let segments: Segments | undefined;
  let batchesOk = 0;
  let lastError = "";
  let consecutiveFails = 0;
  const lang = pack.manifest.sourceLang;
  const batchSize = adaptiveBatchSize(lines.length);
  const tokenVocab =
    lang === "ja" || lang === "es" || lang === "fr"
      ? []
      : await extractVocabulary(lines, lang);

  for (let i = 0; i < lines.length; i += batchSize) {
    const batch = lines.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;
    const batchTotal = Math.ceil(lines.length / batchSize);
    const userPrompt = JSON.stringify({
      sourceLang: pack.manifest.sourceLang,
      nativeLang: pack.manifest.nativeLang,
      level: pack.manifest.level,
      title: pack.manifest.title,
      batchIndex,
      batchTotal,
      lines: batch.map((l) => ({
        id: l.id,
        start: l.start,
        end: l.end,
        text: l.text,
      })),
      includeSegments: i === 0,
      requireFullCoverage: true,
    });

    try {
      const raw = await chatCompletion(systemPrompt, userPrompt);
      const result = extractJson(raw);

      for (const item of result.lines ?? []) {
        const line = pack.transcript.lines.find((l) => l.id === item.id);
        if (line && item.translation) line.translation = item.translation;
      }
      allVocab.push(...(result.vocabulary ?? []));
      allPatterns.push(...(result.patterns ?? []));
      if (result.segments && i === 0) segments = result.segments;
      batchesOk += 1;

      // 增量保存，长素材解析时可轮询看到进度
      pack.manifest.vocabulary = dedupeVocab([...tokenVocab, ...allVocab]).filter(
        (v) =>
          isLikelyWordNotPhrase(v.word, pack.manifest.sourceLang) &&
          !isBasicSkipWord(v.word, pack.manifest.sourceLang)
      );
      ensureFullPatterns(pack);
      pack.manifest.enrichmentMode = "llm";
      pack.manifest.parseStatus = "processing";
      pack.manifest.updatedAt = new Date().toISOString();
      await saveContentPack(pack);
      console.info(
        `[enrich-pack] batch ${batchIndex}/${batchTotal} saved (${lines.filter((l) => l.translation?.trim()).length}/${lines.length} 翻译)`
      );
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      consecutiveFails += 1;
      console.warn(
        `[enrich-pack] batch ${batchIndex}/${batchTotal} failed:`,
        lastError
      );
      // 连续失败则放弃 LLM，快速走规则兜底（避免长素材卡数分钟）
      if (consecutiveFails >= 2 && batchesOk === 0) {
        throw new Error(lastError || "LLM 不可用");
      }
      // 单批失败不中断，继续下一批；最终若零成功则抛错走规则
    }
  }

  if (batchesOk === 0) {
    throw new Error(lastError || "Cursor LLM 全部批次失败");
  }

  // 词汇：LLM 结果 + 分词全量合并
  const mergedVocab = dedupeVocab([...tokenVocab, ...allVocab]).filter(
    (v) =>
      isLikelyWordNotPhrase(v.word, pack.manifest.sourceLang) &&
      !isBasicSkipWord(v.word, pack.manifest.sourceLang)
  );
  pack.manifest.vocabulary = mergedVocab;

  // 句型：以每条字幕为一条；LLM grammar/zh 优先
  const patternByText = new Map<string, PatternItem>();
  for (const p of allPatterns) {
    const key = p.pattern.replace(/\s+/g, " ").trim();
    if (!key) continue;
    patternByText.set(key, p);
  }
  pack.manifest.patterns = lines
    .filter((l) => {
      const t = l.text.trim();
      const minLen = pack.manifest.sourceLang === "ja" ? 1 : 2;
      return t.length >= minLen;
    })
    .map((l, i) => {
      const key = l.text.replace(/\s+/g, " ").trim();
      const hit = patternByText.get(key);
      return {
        id: `pattern-${i + 1}`,
        pattern: l.text.trim(),
        zh: (hit?.zh || l.translation || "").trim(),
        grammar:
          hit?.grammar && hit.grammar !== "句型"
            ? hit.grammar
            : "结合语境理解本句表达功能与搭配",
        examples: hit?.examples,
      };
    });

  if (segments) {
    pack.manifest.segments = segments;
    pack.segments = segments;
  }

  pack.manifest.enrichmentMode = "llm";

  return {
    enriched: true,
    message: `Cursor 解析完成（${batchesOk}/${Math.ceil(lines.length / batchSize)} 批）：字幕翻译 ${lines.filter((l) => l.translation?.trim()).length}/${lines.length}，词汇 ${pack.manifest.vocabulary.length}，句型 ${pack.manifest.patterns.length}`,
    mode: "llm",
  };
}

function dedupeVocab(items: VocabularyItem[]): VocabularyItem[] {
  const map = new Map<string, VocabularyItem>();
  for (const item of items) {
    const key = item.word.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.sentenceIds = [
        ...new Set([...existing.sentenceIds, ...item.sentenceIds]),
      ];
      if (!existing.zh || existing.zh === existing.word) {
        if (item.zh) existing.zh = item.zh;
      }
      if (!existing.glossEn && item.glossEn) existing.glossEn = item.glossEn;
      if (!existing.glossJa && item.glossJa) existing.glossJa = item.glossJa;
      if (!existing.lemma && item.lemma) existing.lemma = item.lemma;
      if (!existing.dictUrl && item.dictUrl) existing.dictUrl = item.dictUrl;
      if (!existing.etymology && item.etymology) existing.etymology = item.etymology;
      if (!existing.notes && item.notes) existing.notes = item.notes;
      if (item.isAcronym) existing.isAcronym = true;
      if (item.isLoanword) existing.isLoanword = true;
      if (!existing.reading && item.reading) existing.reading = item.reading;
      if (!existing.partOfSpeech && item.partOfSpeech) {
        existing.partOfSpeech = item.partOfSpeech;
      }
      if (!existing.level && item.level) existing.level = item.level;
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values()).map((v, i) => ({
    ...v,
    id: `vocab-${i + 1}`,
  }));
}

export interface EnrichOptions {
  /** 跳过 LLM，仅用规则 + 词典/参考资料 */
  offlineOnly?: boolean;
  /** 离线模式词典查询参数 */
  referenceOptions?: EnrichReferenceOptions;
}

/**
 * Cursor SDK 优先全量解析 → 参考词库补洞 → 规则兜底
 */
export async function enrichContentPack(
  pack: ContentPack,
  options?: EnrichOptions
): Promise<EnrichResult> {
  if (!pack.transcript.lines.length) {
    return { enriched: false, message: "无字幕行可增强" };
  }

  const lang = pack.manifest.sourceLang;
  // 日/西/法语：词汇与句型仅听辨页点选解析（与 petit prince / es-coco 一致）
  if (lang === "ja" || lang === "es" || lang === "fr") {
    return enrichOffline(pack, options?.referenceOptions);
  }

  if (
    pack.manifest.enrichmentMode === "llm" &&
    isPackContentReady(pack) &&
    hasQualityEnrichment(pack)
  ) {
    return {
      enriched: true,
      message: "已是完整解析",
      mode: "llm",
    };
  }

  let llmHint = "";

  if (!options?.offlineOnly) {
    try {
      const llmResult = await enrichWithLlm(pack);
      if (llmResult.enriched) {
        await enrichFromReference(pack, options?.referenceOptions);
        pack.manifest.enrichmentMode = "llm";
        // 规则补洞后再保证句型覆盖全字幕
        ensureFullPatterns(pack);
        return {
          ...llmResult,
          message: `${llmResult.message}；已对照参考资料补全`,
        };
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        "[enrich-pack] Cursor LLM failed, fallback to rules:",
        reason
      );
      llmHint = reason.includes("API Key")
        ? `${reason}。请在 Cursor 设置 → Integrations → User API Keys 创建 Key，填入设置页「Cursor API Key」或 .env.local 的 CURSOR_API_KEY`
        : reason;
    }
  } else {
    llmHint = "离线稳妥模式：跳过 LLM，使用规则 + 词典";
  }

  const offline = await enrichOffline(pack, options?.referenceOptions);
  ensureFullPatterns(pack);
  return {
    ...offline,
    message: [llmHint, offline.message].filter(Boolean).join("；"),
  };
}

function hasQualityEnrichment(pack: ContentPack): boolean {
  const lines = pack.transcript.lines;
  const translated = lines.filter((l) => l.translation?.trim()).length;
  const nativeLang = pack.manifest.nativeLang ?? "zh";
  const vocabZh = pack.manifest.vocabulary.filter((v) => {
    const t = v.zh?.trim();
    if (!t || t === v.word) return false;
    if (nativeLang === "zh") return /[\u4e00-\u9fff]/.test(t);
    return true;
  }).length;
  const grammarOk = pack.manifest.patterns.filter(
    (p) => p.grammar && p.grammar !== "句型"
  ).length;
  const translateRatio = lines.length ? translated / lines.length : 0;
  return (
    translateRatio >= 0.5 &&
    vocabZh >= Math.min(10, pack.manifest.vocabulary.length) &&
    grammarOk >= Math.min(10, pack.manifest.patterns.length)
  );
}

export function needsLlmEnrichment(pack: ContentPack): boolean {
  if (!pack.transcript.lines.length) return false;
  if (pack.manifest.enrichmentMode === "llm" && hasQualityEnrichment(pack)) {
    return false;
  }
  return true;
}
