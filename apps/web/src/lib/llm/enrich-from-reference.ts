import type {
  ContentPack,
  PatternItem,
  VocabularyItem,
} from "@langtube/core";
import {
  lookupJaLexicon,
  lookupWordLevel,
  getEnPatterns,
} from "@/lib/level-reference/filter";
import { lookupDictionary } from "@/lib/dictionary/lookup";
import { isLikelyWordNotPhrase } from "@/lib/vocab-extract";
import { ensureFullPatterns } from "@/lib/pack-patterns";
import { translateToZh, hasChineseText, isMyMemoryQuotaExhausted } from "@/lib/translate-zh";
import { getParseRules, dictSourcesLabel } from "@/lib/parse-rules";
import { saveContentPack } from "@/lib/data";

const POS_ZH: Record<string, string> = {
  名: "名词",
  名詞: "名词",
  動: "动词",
  動詞: "动词",
  形: "形容词",
  形容詞: "形容词",
  形動: "形容动词",
  副: "副词",
  副詞: "副词",
  接: "接续词",
  代: "代词",
  Noun: "名词",
  Verb: "动词",
  "Na-adjective": "形容动词",
  "I-adjective": "い形容词",
};

function mapPos(pos?: string): string | undefined {
  if (!pos) return undefined;
  return POS_ZH[pos] || pos;
}

/**
 * 用 Language 参考词库 / 词典补齐：
 * - 词汇：单词 + 中文释义（过滤句子片段）
 * - 句型：原句 + 中文意思 + 语法解读
 */
export type EnrichReferenceOptions = {
  /** 词典查询上限；离线逐条解析时可提高 */
  dictLimit?: number;
  /** 每次词典/翻译请求间隔（毫秒） */
  dictDelayMs?: number;
};

export async function enrichFromReference(
  pack: ContentPack,
  options?: EnrichReferenceOptions
): Promise<{ enriched: boolean; message: string }> {
  const lang = pack.manifest.sourceLang;
  const level = pack.manifest.level;
  let vocabFilled = 0;
  let patternFilled = 0;
  const nativeZh = pack.manifest.nativeLang === "zh";

  // 优先补齐字幕行中文（句型 zh 依赖 translation）
  const translatedBefore = pack.transcript.lines.filter((l) =>
    l.translation?.trim()
  ).length;
  const needLineZh =
    nativeZh &&
    pack.transcript.lines.length > 0 &&
    translatedBefore / pack.transcript.lines.length < 0.3;
  const lineFilled = needLineZh ? await fillMissingLineTranslations(pack) : 0;

  // —— 词汇：只要单词 ——
  const vocab: VocabularyItem[] = [];
  for (const v of pack.manifest.vocabulary) {
    if (!isLikelyWordNotPhrase(v.word, lang)) continue;

    const lex = lang === "ja" ? lookupJaLexicon(v.word) : undefined;
    const wordLevel = v.level || lookupWordLevel(v.word, lang);
    // 若 zh 看起来像整句翻译（过长），清空后用词库
    const zhLooksLikeSentence =
      (v.zh?.length ?? 0) > 24 || /[。！？]/.test(v.zh ?? "");
    const zh =
      (!zhLooksLikeSentence && v.zh && v.zh !== v.word ? v.zh : "") ||
      lex?.zh ||
      lex?.gloss ||
      "";

    const next: VocabularyItem = {
      ...v,
      zh: zh || "",
      reading: v.reading || lex?.reading,
      partOfSpeech: mapPos(v.partOfSpeech || lex?.pos) || v.partOfSpeech,
      level: wordLevel || v.level,
    };
    if (next.zh && next.zh !== next.word) vocabFilled += 1;
    vocab.push(next);
  }

  // 优先保留词库命中项
  vocab.sort((a, b) => {
    const ae = lang === "ja" && lookupJaLexicon(a.word) ? 1 : 0;
    const be = lang === "ja" && lookupJaLexicon(b.word) ? 1 : 0;
    if (be !== ae) return be - ae;
    return b.sentenceIds.length - a.sentenceIds.length;
  });

  const needDict = vocab.filter((v) => !v.zh || v.zh === v.word);
  const defaultLimit = lang === "ja" || lang === "en" ? 120 : 100;
  const dictLimit =
    options?.dictLimit ?? Math.min(needDict.length, defaultLimit);
  const dictDelayMs = options?.dictDelayMs ?? 150;

  for (const v of needDict.slice(0, dictLimit)) {
    try {
      const hit = await lookupDictionary(v.word, lang);
      if (!hit?.senses[0]?.glossEn[0]) {
        if (nativeZh && lang !== "es" && lang !== "fr") {
          const direct = await translateToZh(v.word, lang);
          if (direct && hasChineseText(direct)) {
            v.zh = direct;
            vocabFilled += 1;
          }
        }
        await new Promise((r) => setTimeout(r, dictDelayMs));
        continue;
      }
      const gloss = hit.senses
        .flatMap((s) => s.glossEn)
        .filter(Boolean)
        .slice(0, 6)
        .join("；");
      if (nativeZh) {
        if ((lang === "es" || lang === "fr") && hasChineseText(gloss)) {
          v.zh = gloss;
          vocabFilled += 1;
        } else {
          let zh = (await translateToZh(gloss, "en")) || "";
          if (!zh || !hasChineseText(zh)) {
            zh = (await translateToZh(v.word, lang)) || "";
          }
          if (zh && hasChineseText(zh)) {
            v.zh = zh;
            vocabFilled += 1;
          }
        }
      } else if (!v.zh || v.zh === v.word) {
        v.zh = gloss;
        vocabFilled += 1;
      }
      v.reading = v.reading || hit.reading;
      v.partOfSpeech =
        v.partOfSpeech || mapPos(hit.senses[0].partOfSpeech[0]);
      await new Promise((r) => setTimeout(r, dictDelayMs));
    } catch {
      /* ignore */
    }
  }

  pack.manifest.vocabulary = vocab.map((v, i) => ({
    ...v,
    id: `vocab-${i + 1}`,
  }));

  // —— 句型：与字幕行 1:1 全量，再补语法讲解 ——
  const lineZh = new Map(
    pack.transcript.lines.map((l) => [
      l.text.trim(),
      l.translation?.trim() ?? "",
    ])
  );
  const existingByText = new Map(
    pack.manifest.patterns.map((p) => [p.pattern.replace(/\s+/g, " ").trim(), p])
  );

  const sourcePatterns = pack.transcript.lines
    .filter((l) => {
      const t = l.text.trim();
      const minLen = lang === "ja" ? 1 : 2;
      return t.length >= minLen;
    })
    .map((l, i) => {
      const key = l.text.replace(/\s+/g, " ").trim();
      const hit = existingByText.get(key);
      return {
        id: `pattern-${i + 1}`,
        pattern: l.text.trim(),
        zh:
          (hit?.zh && hit.zh !== hit.pattern ? hit.zh : "") ||
          lineZh.get(l.text.trim()) ||
          "",
        grammar: hit?.grammar && hit.grammar !== "句型" ? hit.grammar : "句型",
        examples: hit?.examples ?? [],
      };
    });

  const enrichedPatterns: PatternItem[] = [];

  for (const p of sourcePatterns) {
    const fromLine =
      lineZh.get(p.pattern.trim()) ||
      pack.transcript.lines.find((l) => l.text.includes(p.pattern.slice(0, 12)))
        ?.translation ||
      "";
    const zh = (p.zh && p.zh !== p.pattern ? p.zh : "") || fromLine || "";

    let grammar =
      p.grammar && p.grammar !== "句型" ? p.grammar : "";

    if (lang === "en") {
      const catalog = getEnPatterns();
      const hit = catalog.find((c) =>
        p.pattern
          .toLowerCase()
          .includes(c.pattern.toLowerCase().replace(/\.+$/, "").slice(0, 20))
      );
      if (hit) {
        grammar = hit.pattern;
        enrichedPatterns.push({
          ...p,
          zh: zh || hit.zh.slice(0, 160),
          grammar,
          examples: hit.examples?.length ? hit.examples : p.examples,
        });
        patternFilled += 1;
        continue;
      }
      grammar = grammar || inferEnglishGrammar(p.pattern);
    } else if (lang === "ja") {
      grammar = grammar || inferJapaneseGrammar(p.pattern);
    } else if (lang === "es") {
      grammar = grammar || inferSpanishGrammar(p.pattern);
    } else if (lang === "fr") {
      grammar = grammar || inferFrenchGrammar(p.pattern);
    } else {
      grammar = grammar || "常用表达（结合上下文理解）";
    }

    enrichedPatterns.push({
      ...p,
      pattern: p.pattern.trim(),
      zh,
      grammar,
      examples:
        p.examples?.length && !p.examples[0]?.startsWith("例：")
          ? p.examples
          : undefined,
    });
    if (grammar && grammar !== "句型") patternFilled += 1;
  }

  if (enrichedPatterns.length) {
    pack.manifest.patterns = enrichedPatterns.map((p, i) => ({
      ...p,
      id: `pattern-${i + 1}`,
    }));
  }

  const levelTag = `level:${level}`;
  if (!pack.manifest.topics.includes(levelTag)) {
    pack.manifest.topics = [...pack.manifest.topics, levelTag];
  }

  if (
    pack.manifest.enrichmentMode !== "llm" &&
    (vocabFilled > 0 || patternFilled > 0)
  ) {
    pack.manifest.enrichmentMode = "rules";
  }

  if (lineFilled > 0) {
    ensureFullPatterns(pack);
    patternFilled = pack.manifest.patterns.filter((p) =>
      hasChineseText(p.zh ?? "")
    ).length;
  }

  const rules = getParseRules(lang);
  const dictNote = dictSourcesLabel(rules.vocabDictSources);

  return {
    enriched:
      vocabFilled > 0 || patternFilled > 0 || vocab.length > 0 || lineFilled > 0,
    message: `参考资料增强（${dictNote}）：词汇释义 ${vocabFilled}/${pack.manifest.vocabulary.length}，句型讲解 ${patternFilled}/${pack.manifest.patterns.length}${lineFilled ? `，字幕翻译 ${lineFilled}` : ""}`,
  };
}

/** 为无 translation 的字幕行批量补中文（规则兜底） */
async function fillMissingLineTranslations(pack: ContentPack): Promise<number> {
  const lang = pack.manifest.sourceLang;
  const nativeZh = (pack.manifest.nativeLang ?? "zh") === "zh";
  if (!nativeZh) return 0;

  const missing = pack.transcript.lines.filter(
    (l) => l.text.trim() && !l.translation?.trim()
  );
  if (!missing.length) return 0;

  if (await isMyMemoryQuotaExhausted(lang)) {
    console.warn(
      "[enrich] MyMemory 配额用尽，将尝试 Lingva/gtx 备用翻译源"
    );
  }

  let filled = 0;
  for (const line of missing) {
    const zh = await translateToZh(line.text, lang);
    if (zh) {
      line.translation = zh;
      filled += 1;
    }
    await new Promise((r) => setTimeout(r, 280));
    if (filled > 0 && filled % 40 === 0) {
      pack.manifest.updatedAt = new Date().toISOString();
      await saveContentPack(pack);
    }
  }
  return filled;
}

function selectKeyPatterns(
  patterns: PatternItem[],
  lang: string,
  limit: number
): PatternItem[] {
  const scored = patterns.map((p) => {
    const text = p.pattern.replace(/\s+/g, "");
    let score = 0;
    const len = text.length;
    if (lang === "ja") {
      if (len >= 8 && len <= 50) score += 5;
      if (/[はがをにでと]/.test(text)) score += 2;
      if (/た。|です|ます|ない|よう|ば|たら|のに|ので|とは/.test(text)) {
        score += 3;
      }
      if (p.zh?.trim()) score += 2;
    } else {
      const words = p.pattern.split(/\s+/).length;
      if (words >= 4 && words <= 18) score += 5;
      if (p.zh?.trim()) score += 2;
    }
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked: PatternItem[] = [];
  const seen = new Set<string>();
  for (const { p } of scored) {
    const key = p.pattern.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(p);
    if (picked.length >= limit) break;
  }
  return picked.length ? picked : patterns.slice(0, limit);
}

function inferJapaneseGrammar(text: string): string {
  if (/とは[、，,]/.test(text) || /とは.*です/.test(text) || /とは.*である/.test(text)) {
    return "〜とは、〜です／である：定义说明「A 就是 B」";
  }
  if (/知らないうちに/.test(text)) {
    return "知らないうちに：不知不觉中（在未察觉的期间）";
  }
  if (/の多くは/.test(text)) return "〜の多くは：大多数…";
  if (/むしろ/.test(text)) return "むしろ：与其说…不如…／反而";
  if (/よりも/.test(text)) return "〜よりも：比…更…（比较）";
  if (/方が/.test(text) && /やすい|にくい/.test(text)) {
    return "〜方が〜やすい：更易于…（比较倾向）";
  }
  if (/こそが|こそ/.test(text)) return "〜こそ：正是…（强调）";
  if (/として/.test(text)) return "〜として：作为…";
  if (/について/.test(text)) return "〜について：关于…";
  if (/によって/.test(text)) return "〜によって：依据／由于／被动主体";
  if (/たら/.test(text)) return "〜たら：假定・发现条件「如果／一…就」";
  if (/ば[^。]{0,16}/.test(text) && /ば/.test(text)) {
    return "〜ば：假定条件「如果…」";
  }
  if (/のに/.test(text)) return "〜のに：逆接・不满「却…」";
  if (/ので|から/.test(text)) return "〜ので／から：原因・理由「因为…」";
  if (/てしまう|ちゃう|じゃう/.test(text)) {
    return "〜てしまう：完了・遗憾「…掉了」";
  }
  if (/てみる/.test(text)) return "〜てみる：尝试「试着…」";
  if (/ておく|とく/.test(text)) return "〜ておく：预备「事先…」";
  if (/なければならない|なくちゃ|なきゃ/.test(text)) {
    return "〜なければならない：必须…";
  }
  if (/かもしれない/.test(text)) return "〜かもしれない：也许…";
  if (/ようです|みたい/.test(text)) return "〜ようだ／みたい：推测・比喻";
  if (/そうです/.test(text)) return "〜そうです：传闻・样态";
  if (/ください/.test(text)) return "〜てください：请求「请…」";
  if (/ましょう/.test(text)) return "〜ましょう：劝诱「一起…吧」";
  if (/たい/.test(text)) return "〜たい：愿望「想要…」";
  if (/ている|てる/.test(text)) return "〜ている：进行・状态";
  if (/たことがある/.test(text)) return "〜たことがある：经验「曾经…」";
  if (/ではなく/.test(text)) return "〜ではなく：不是 A 而是 B";
  if (/装って|装い/.test(text)) return "〜を装って：装作…／伪装成…";
  return "实用表达：结合字幕语境理解该句功能与搭配";
}

function inferEnglishGrammar(text: string): string {
  const t = text.toLowerCase();
  if (/you'd better|you had better/.test(t)) {
    return "You'd better + V：建议・紧迫「最好…」";
  }
  if (/there's something wrong with/.test(t)) {
    return "There's something wrong with…：指出问题";
  }
  if (/don't ever|never /.test(t)) return "Don't ever / Never + V：禁止";
  if (/make sure (that )?/.test(t)) return "Make sure (that)…：确保";
  if (/you seem /.test(t)) return "You seem + adj：观察感受";
  if (/if I were you/.test(t)) return "If I were you…：虚拟建议";
  if (/\bused to\b/.test(t)) return "used to + V：过去习惯";
  if (/\bhave been\b|\bhas been\b/.test(t)) return "现在完成进行／状态";
  if (/\bgoing to\b/.test(t)) return "be going to：计划・预测";
  if (/\brather than\b/.test(t)) return "rather than：而不是…";
  return "Common conversational pattern：结合语境理解";
}

function inferSpanishGrammar(text: string): string {
  const t = text.toLowerCase();
  if (/\bhay que\b/.test(t)) return "hay que + infinitivo：必须…";
  if (/\btiene que\b|\btienen que\b/.test(t)) {
    return "tener que + infinitivo：不得不…";
  }
  if (/\bes que\b/.test(t)) return "es que…：原因解释「是因为…」";
  if (/\baunque\b/.test(t)) return "aunque：虽然／即使";
  if (/\bpara que\b/.test(t)) return "para que + subjuntivo：为了…";
  if (/\bse me\b|\bse te\b|\bse le\b/.test(t)) {
    return "se + me/te/le：非自主发生（忘了／掉了）";
  }
  return "Expresión frecuente：结合语境理解该句功能";
}

function inferFrenchGrammar(text: string): string {
  const t = text.toLowerCase();
  if (/\bne\s+\w+\s+pas\b/.test(t)) return "ne … pas：否定结构";
  if (/\bavoir besoin de\b/.test(t)) return "avoir besoin de：需要…";
  if (/\bvenir de\b/.test(t)) return "venir de + inf.：刚刚…";
  if (/\bavoir l'air\b/.test(t)) return "avoir l'air：看起来…";
  if (/\bplutôt que\b/.test(t)) return "plutôt que：而不是…";
  if (/\bbien que\b/.test(t)) return "bien que + subj.：虽然…";
  return "Expression courante：结合语境理解该句功能";
}
