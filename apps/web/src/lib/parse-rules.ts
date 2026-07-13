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
}

export const PARSE_RULES: Record<SupportedLanguage, LangParseRules> = {
  en: {
    subtitleFollowSourceOnly: true,
    vocabLabel: "释义",
    patternLabel: "句型讲解",
    vocabDictSources: [
      { name: "Cambridge", url: "https://dictionary.cambridge.org/zhs/" },
    ],
    patternDictSources: [
      { name: "Cambridge", url: "https://dictionary.cambridge.org/zhs/" },
    ],
    dictionaryBackend: "cambridge-style",
  },
  ja: {
    subtitleFollowSourceOnly: true,
    vocabLabel: "释义",
    patternLabel: "句型讲解",
    vocabDictSources: [
      { name: "MOJi辞書", url: "https://www.mojidict.com/" },
    ],
    patternDictSources: [
      { name: "MOJi辞書", url: "https://www.mojidict.com/" },
    ],
    dictionaryBackend: "moji-jmdict",
  },
  es: {
    subtitleFollowSourceOnly: true,
    vocabLabel: "释义",
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
  },
  fr: {
    subtitleFollowSourceOnly: true,
    vocabLabel: "释义",
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
  },
};

export function getParseRules(lang: SupportedLanguage): LangParseRules {
  return PARSE_RULES[lang] ?? PARSE_RULES.en;
}

export function dictSourcesLabel(sources: DictSource[]): string {
  return sources.map((s) => `${s.name}(${s.url})`).join("、");
}

/** LLM 全量增强提示（按语种词典参考） */
export function buildEnrichSystemPrompt(pack: ContentPack): string {
  const lang = pack.manifest.sourceLang;
  const rules = getParseRules(lang);
  const dictRef = dictSourcesLabel(rules.vocabDictSources);
  const patternRef = dictSourcesLabel(rules.patternDictSources);
  const native = pack.manifest.nativeLang ?? "zh";
  const meaningLang = native === "zh" ? "中文" : "母语";

  return `你是 LangTube 语言学习素材分析助手。必须对本批次字幕做全量解析，输出 JSON（不要 markdown）。

素材语种：${lang} | 母语：${native}

硬性要求：
1. lines：字幕跟随仅展示原文，translation 字段可留空或供内部使用，不要依赖双语对照
2. vocabulary：本批次学习单词（只要单词不要句子，同一单词只出现一次）
   - word、reading（日语假名，其他语种可省略）
   - zh = 全部${meaningLang}释义（多条用「；」分隔，参考 ${dictRef}，须覆盖主要义项）
   - partOfSpeech、level、sentenceIds
3. patterns：对本批次每一行字幕各生成一条（句型 Tab 将按语法讲解去重展示）
   - pattern = 原文整句（${lang}）
   - zh = ${meaningLang}句意（可简短）
   - grammar = ${rules.patternLabel}（参考 ${patternRef}，须具体说明语法点/搭配，禁止只写「句型」或重复同一条讲解）
4. 仅第一批可带 segments

输出 schema：
{
  "lines": [{"id": "line-1", "translation": ""}],
  "vocabulary": [{"id": "vocab-1", "word": "word", "zh": "释义", "partOfSpeech": "noun", "sentenceIds": ["line-1"]}],
  "patterns": [{"id": "pattern-1", "pattern": "原文句子", "zh": "句意", "grammar": "句型讲解"}],
  "segments": {"extensive": [...], "intensive": [...]}
}`;
}
