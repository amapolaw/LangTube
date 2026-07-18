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
- 完整一句 + zh 中文释义；grammar 仅写具体语法点/固定搭配/俚语习惯用法
- 禁止笼统套话（如「关注主谓结构、时态与关键搭配」）；若无具体点则 grammar 留空
- 已出现过的同一语法点/搭配/俚语，后续句不再重复解析展示
- 习惯用法、俚语、固定搭配若有则在 grammar 中重点讲解`,
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
    langSpecificRules: `【日语专属 · 与听辨页 mrfs6rgb 一致】
字幕对照：只展示原声日文，不写行级对照译文。
词汇表（仅点选解析写入，禁止全量自动抽取）：
- 展示 word（原形/词典形）+ reading（假名读音）+ 中文释义(zh)；不展示 glossEn / glossJa
- 误选整句/短语时重新解析须拆成单词（如 黙る，而非整句）
- 字幕变化形写入 notes（字幕形：… / 出自短语：…）
- 词性用中文（他动词/自动词/连体词等）
- 跳过助词/疑问词等功能词
句型 / 语法（仅勾选字幕句后解析）：
- 完整一句原文 + zh 中文句意 + grammar 具体语法点/固定搭配（中文）
- 禁止笼统套话；无具体点则 grammar 留空
- 已出现过的同一语法点/搭配不重复`,
  },
  es: {
    subtitleFollowSourceOnly: true,
    vocabLabel: "中文释义",
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
    langSpecificRules: `【西班牙语专属 · 与听辨页 es-coco 一致】
字幕对照：只展示原声西语，不写行级对照译文。
词汇表（仅点选解析写入，禁止全量自动抽取）：
- 展示 word/lemma（动词不定式原形）+ 中文释义(zh)；不展示 glossEn
- 字幕变化形写入 notes（字幕形：…）
- dictUrl 指向 SpanishDict 变位表
- 跳过冠词/代词/疑问词等功能词
句型 / 语法（仅勾选字幕句后解析）：
- 完整一句原文 + zh 中文句意 + grammar 具体语法点/固定搭配（中文）
- 禁止笼统套话；无具体点则 grammar 留空`,
  },
  fr: {
    subtitleFollowSourceOnly: true,
    vocabLabel: "中文释义",
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
    langSpecificRules: `【法语专属 · 与听辨页 petit prince 一致】
字幕对照：只展示原声法语，不写行级对照译文。
词汇表（仅点选解析写入，禁止全量自动抽取）：
- 展示 word/lemma（动词不定式原形）+ 中文释义(zh)；不展示 glossEn
- 字幕变化形写入 notes（字幕形：…）；搭配写入 notes（搭配：…）
- dictUrl 指向 WordReference 词典页
- 跳过冠词/代词/疑问词等功能词
句型 / 语法（仅勾选字幕句后解析）：
- 完整一句原文 + zh 中文句意 + grammar 具体语法点/固定搭配（中文）
- 禁止笼统套话；无具体点则 grammar 留空`,
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

/** 法语词条词典链接（名词/形容词/动词通用） */
export function frenchDictUrl(word: string): string {
  return `https://www.wordreference.com/fren/${encodeURIComponent(word.trim().toLowerCase())}`;
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
4. patterns：只解析完整一句；grammar 须具体（语法点/搭配/俚语）；无具体点则 grammar 留空；禁止笼统套话；重复知识点跳过。
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
