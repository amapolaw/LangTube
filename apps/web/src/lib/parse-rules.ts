import type { ContentPack, SupportedLanguage } from "@langtube/core";

export type DictSource = { name: string; url: string };

export interface LangParseRules {
  /** 字幕跟随区只展示视频语种原文 */
  subtitleFollowSourceOnly: boolean;
  vocabLabel: string;
  patternLabel: string;
  vocabDictSources: DictSource[];
  patternDictSources: DictSource[];
  /** 词典查询后端标识 */
  dictionaryBackend: string;
  /** LLM / UI 用的语种专属条款（补充通用省 Token 规则） */
  langSpecificRules: string;
}

export const PARSE_RULES: Record<SupportedLanguage, LangParseRules> = {
  en: {
    subtitleFollowSourceOnly: true,
    vocabLabel: "中英文释义",
    patternLabel: "句型讲解",
    vocabDictSources: [
      { name: "Cambridge", url: "https://dictionary.cambridge.org/zhs/" },
    ],
    patternDictSources: [
      { name: "Cambridge", url: "https://dictionary.cambridge.org/zhs/" },
    ],
    dictionaryBackend: "cambridge-style",
    langSpecificRules: `【英语专属】
字幕对照：优先使用已上传/粘贴的英语字幕；只展示跟随字幕（原声英文），不写行级对照译文。
词汇表：
- 展示 word + 全部中文释义(zh) + 全部英文释义(glossEn)；多义用「；」分隔
- 代词 / 冠词 / 疑问词（what/who/where/when/why/how/which…）跳过，不解析不展示
- 专业词汇与缩写（NASA、API、GDP 等）必须收录：isAcronym=true，notes 写全称与简要解释
句型 / 语法：
- 完整一句 + zh 中文释义 + grammar 句型讲解
- 习惯用法、俚语、固定搭配须在 grammar 中重点讲解
- 已出现的重复句型 / 同一 grammar 不解析不展示`,
  },
  ja: {
    subtitleFollowSourceOnly: true,
    vocabLabel: "中日文释义",
    patternLabel: "句型讲解",
    vocabDictSources: [
      { name: "MOJi辞書", url: "https://www.mojidict.com/" },
    ],
    patternDictSources: [
      { name: "MOJi辞書", url: "https://www.mojidict.com/" },
    ],
    dictionaryBackend: "moji-jmdict",
    langSpecificRules: `【日语专属】
字幕对照：优先使用已上传/粘贴的日语字幕；只展示跟随字幕（原声日文），不写行级对照译文。
词汇表：
- 展示 word + reading(假名) + 全部中文释义(zh) + 日文释义(glossJa，可简短)
- 代词 / 助词性功能词 / 疑问词（誰/何/どこ/いつ/なぜ/どう…）跳过，不解析不展示
- 片假名外来语：isLoanword=true，etymology 标示来源语言与原词（例：「英語: computer」）
句型 / 语法：
- 完整一句 + zh 中文释义 + grammar 句型讲解
- 句中汉字词须能依托 vocabulary.reading 做平假名注音（reading 填平/片假名均可）
- 习惯用法、俚语、ロール語須在 grammar 中重点讲解
- 重复句型不解析不展示`,
  },
  es: {
    subtitleFollowSourceOnly: true,
    vocabLabel: "中英文释义",
    patternLabel: "句型讲解",
    vocabDictSources: [
      { name: "SpanishDict", url: "https://www.spanishdict.com/" },
      { name: "CuteSlator", url: "https://www.cuteslator.com/dictionary/es" },
      { name: "西语助手", url: "https://www.esdict.cn/" },
    ],
    patternDictSources: [
      { name: "SpanishDict", url: "https://www.spanishdict.com/" },
      { name: "CuteSlator", url: "https://www.cuteslator.com/dictionary/es" },
      { name: "西语助手", url: "https://www.esdict.cn/" },
    ],
    dictionaryBackend: "spanish-multisource",
    langSpecificRules: `【西班牙语专属】
字幕对照：优先使用已上传/粘贴的西语字幕；只展示跟随字幕（原声西语），不写行级对照译文。
词汇表：
- 展示 word + 全部中文释义(zh) + 全部英文释义(glossEn)
- 冠词 / 疑问词（qué/quién/dónde/cuándo/cómo/cuál…）跳过，不解析不展示
- 有时态或人称变化的动词：lemma 填不定式原型，dictUrl 给变化表链接（SpanishDict conjugate）
- 词条 word 可保留字幕中的变化形，但必须附带 lemma + dictUrl
句型 / 语法：
- 完整一句 + zh 中文释义 + grammar；习惯用法、俚语重点讲解
- 重复句型不解析不展示`,
  },
  fr: {
    subtitleFollowSourceOnly: true,
    vocabLabel: "中英文释义",
    patternLabel: "句型讲解",
    vocabDictSources: [
      { name: "CuteSlator", url: "https://www.cuteslator.com/dictionary/fr" },
      { name: "法语助手", url: "https://www.frdic.com/" },
    ],
    patternDictSources: [
      { name: "CuteSlator", url: "https://www.cuteslator.com/dictionary/fr" },
      { name: "法语助手", url: "https://www.frdic.com/" },
    ],
    dictionaryBackend: "french-multisource",
    langSpecificRules: `【法语专属】
字幕对照：优先使用已上传/粘贴的法语字幕；只展示跟随字幕（原声法语），不写行级对照译文。
词汇表：
- 展示 word + 全部中文释义(zh) + 全部英文释义(glossEn)
- 冠词 / 疑问词（qui/que/quoi/où/quand/comment/lequel…）跳过，不解析不展示
- 有时态或人称变化的动词：lemma 填不定式原型，dictUrl 给变位表链接（WordReference / 法语助手）
- 词条 word 可保留字幕中的变化形，但必须附带 lemma + dictUrl
句型 / 语法：
- 完整一句 + zh 中文释义 + grammar；习惯用法、俚语重点讲解
- 重复句型不解析不展示`,
  },
};

export function getParseRules(lang: SupportedLanguage): LangParseRules {
  return PARSE_RULES[lang] ?? PARSE_RULES.en;
}

export function dictSourcesLabel(sources: DictSource[]): string {
  return sources.map((s) => `${s.name}(${s.url})`).join("、");
}

/** 西/法语动词变位词典链接 */
export function conjugationDictUrl(
  lang: SupportedLanguage,
  lemma: string
): string | undefined {
  const w = lemma.trim().toLowerCase();
  if (!w) return undefined;
  if (lang === "es") {
    return `https://www.spanishdict.com/conjugate/${encodeURIComponent(w)}`;
  }
  if (lang === "fr") {
    return `https://www.wordreference.com/conj/FRverbs.aspx?v=${encodeURIComponent(w)}`;
  }
  if (lang === "en") {
    return `https://dictionary.cambridge.org/zhs/词典/英语-汉语-简体/${encodeURIComponent(w)}`;
  }
  if (lang === "ja") {
    return `https://www.mojidict.com/searchText/${encodeURIComponent(lemma.trim())}`;
  }
  return undefined;
}

/** LLM 省 Token + 语种专属增强提示 */
export function buildEnrichSystemPrompt(pack: ContentPack): string {
  const lang = pack.manifest.sourceLang;
  const rules = getParseRules(lang);
  const dictRef = dictSourcesLabel(rules.vocabDictSources);
  const patternRef = dictSourcesLabel(rules.patternDictSources);
  const native = pack.manifest.nativeLang ?? "zh";

  return `你是 LangTube 语言学习素材分析助手。对本批次字幕做精炼解析，输出 JSON（不要 markdown）。严格节省 token，并严格执行语种专属规则。

素材语种（视频原声）：${lang} | 学习母语：${native}
词典参考：${dictRef}
句型参考：${patternRef}

## 通用硬性规则（省 Token）
0. 所有原文字段必须是视频原声语种 ${lang}；禁止把自动翻译字幕当原文。
1. lines：字幕跟随只保留原声文本；translation 一律 ""。
2. 跳过无用行（BGM/广告/语气词/无正文），不为它们生成词汇或句型。
3. vocabulary：只要单词；同一词只出现一次；跳过代词/冠词/疑问词/超基础功能词。
4. patterns：只解析完整一句；grammar 须具体；习惯用法/俚语重点讲；重复句型跳过。
5. 仅第一批可带 segments。

## 语种专属规则（必须遵守）
${rules.langSpecificRules}

## 输出 schema
{
  "lines": [{"id": "line-1", "translation": ""}],
  "vocabulary": [{
    "id": "vocab-1",
    "word": "字幕中的词形",
    "zh": "中文释义1；释义2",
    "glossEn": "optional English glosses",
    "glossJa": "optional Japanese gloss (ja only)",
    "reading": "假名(ja)",
    "lemma": "原型(es/fr 动词等)",
    "dictUrl": "https://...",
    "etymology": "英語: computer (片假名外来语)",
    "notes": "缩写/专业词说明",
    "isAcronym": false,
    "isLoanword": false,
    "partOfSpeech": "noun",
    "sentenceIds": ["line-1"]
  }],
  "patterns": [{
    "id": "pattern-1",
    "pattern": "原文完整句",
    "zh": "中文句意",
    "grammar": "含习惯用法/俚语重点的句型讲解"
  }],
  "segments": {"extensive": [...], "intensive": [...]}
}`;
}
