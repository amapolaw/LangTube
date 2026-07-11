/**
 * 权威词典查询（服务端）
 * - 英语：Free Dictionary（Cambridge 风格中文释义）
 * - 日语：Jisho / JMDict（MOJi辞書 风格）
 * - 西/法语：多源释义（SpanishDict / esdict / Frdic 风格）
 */

import { translateToZh, hasChineseText } from "@/lib/translate-zh";

export type DictionarySense = {
  glossEn: string[];
  partOfSpeech: string[];
  info?: string[];
};

export type DictionaryLookup = {
  headword: string;
  reading?: string;
  senses: DictionarySense[];
  examples: string[];
  source: string;
  /** 原始查询词 */
  query: string;
};

function normalizeQuery(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[「」『』""''（）()【】\[\]]/g, "")
    .trim();
}

/** 为日语活用形生成若干检索候选 */
export function japaneseQueryCandidates(raw: string): string[] {
  const q = normalizeQuery(raw);
  const candidates = new Set<string>();
  if (!q) return [];

  // 整句过长时不直接查，避免命中助词/接续词
  if (q.length <= 16) {
    candidates.add(q);
  }

  const stripped = q
    .replace(/[、。！？!?,.\n]+/g, " ")
    .replace(/(って|とか|など|なんか|よね|だよ|なの|です|ます)$/g, "")
    .trim();

  if (stripped && stripped.length <= 16) candidates.add(stripped);

  // て形 → 辞書形（粗略）
  if (/て$/.test(stripped) && stripped.length <= 16) {
    candidates.add(stripped.replace(/て$/, "る"));
    candidates.add(stripped.replace(/って$/, "る"));
    candidates.add(stripped.replace(/んで$/, "む"));
  }

  // 「血相変えて」→「血相を変える」
  const m = stripped.match(
    /([\u4e00-\u9fff々]{1,6})(変え|変え[てる]|変えました)/
  );
  if (m) {
    candidates.add(`${m[1]}を変える`);
    candidates.add(`${m[1]}をかえる`);
  }

  // 「相談に乗って」→「相談に乗る」
  const ride = stripped.match(
    /([\u4e00-\u9fff々]{1,6})に乗([ってるりた])/
  );
  if (ride) {
    candidates.add(`${ride[1]}に乗る`);
  }

  // 汉字复合词 2–8 字
  for (const hit of stripped.matchAll(/[\u4e00-\u9fff々]{2,8}/g)) {
    candidates.add(hit[0]);
  }

  // 假名+汉字短块
  for (const hit of stripped.matchAll(
    /[\u4e00-\u9fffぁ-んァ-ンー]{2,12}/g
  )) {
    if (hit[0].length <= 12) candidates.add(hit[0]);
  }

  return [...candidates]
    .filter((c) => c.length >= 2 && c.length <= 16)
    .sort((a, b) => b.length - a.length)
    .slice(0, 8);
}

type JishoResponse = {
  data?: {
    slug?: string;
    japanese?: { word?: string; reading?: string }[];
    senses?: {
      english_definitions?: string[];
      parts_of_speech?: string[];
      info?: string[];
      tags?: string[];
    }[];
    attribution?: { jmdict?: boolean };
  }[];
};

export async function lookupJisho(
  query: string
): Promise<DictionaryLookup | null> {
  const candidates = japaneseQueryCandidates(query);
  type Scored = { lookup: DictionaryLookup; score: number };
  const found: Scored[] = [];

  for (const keyword of candidates) {
    try {
      const res = await fetch(
        `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(keyword)}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(12000),
        }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as JishoResponse;
      const entries = data.data ?? [];
      if (!entries.length) continue;

      for (const entry of entries.slice(0, 3)) {
        const jp = entry.japanese?.[0];
        const head = jp?.word || jp?.reading || "";
        if (!entry.senses?.length || !head) continue;
        const pos0 = (entry.senses[0]?.parts_of_speech ?? []).join(" ");

        let score = 0;
        if (head === keyword) score += 120;
        else if (head.startsWith(keyword) || keyword.startsWith(head))
          score += 60;
        else if (head.includes(keyword) || keyword.includes(head)) score += 25;
        else continue; // 跳过无关模糊命中

        if (/Expression|Verb|Noun|Idiomatic|Adjective/i.test(pos0)) score += 35;
        if (/Conjunction|Particle|Prefix|Suffix|Counter/i.test(pos0))
          score -= 80;
        if (/[\u4e00-\u9fff]/.test(head)) score += 20;
        if (/[をに]/.test(head)) score += 25; // 优先「相談に乗る」「血相を変える」
        if (head.length >= 2 && head.length <= 8) score += 10;

        const senses: DictionarySense[] = entry.senses.slice(0, 4).map((s) => ({
          glossEn: s.english_definitions ?? [],
          partOfSpeech: s.parts_of_speech ?? [],
          info: [...(s.info ?? []), ...(s.tags ?? [])].filter(Boolean),
        }));

        found.push({
          score,
          lookup: {
            headword: head,
            reading: jp?.reading,
            senses,
            examples: [],
            source: entry.attribution?.jmdict
              ? "MOJi辞書 / JMDict"
              : "MOJi辞書 / Jisho",
            query: keyword,
          },
        });
      }
    } catch {
      continue;
    }
  }

  found.sort((a, b) => b.score - a.score);
  return found[0]?.score >= 30 ? found[0].lookup : null;
}

type FreeDictEntry = {
  word?: string;
  phonetic?: string;
  meanings?: {
    partOfSpeech?: string;
    definitions?: {
      definition?: string;
      example?: string;
      synonyms?: string[];
    }[];
  }[];
};

export async function lookupFreeDictionary(
  query: string
): Promise<DictionaryLookup | null> {
  const word = normalizeQuery(query).split(/\s+/)[0];
  if (!word || !/^[a-zA-Z][a-zA-Z'-]*$/.test(word)) return null;

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as FreeDictEntry[];
    const entry = data[0];
    if (!entry?.meanings?.length) return null;

    const senses: DictionarySense[] = [];
    const examples: string[] = [];
    for (const meaning of entry.meanings.slice(0, 3)) {
      for (const def of (meaning.definitions ?? []).slice(0, 2)) {
        if (!def.definition) continue;
        senses.push({
          glossEn: [def.definition],
          partOfSpeech: meaning.partOfSpeech ? [meaning.partOfSpeech] : [],
        });
        if (def.example) examples.push(def.example);
      }
    }

    return {
      headword: entry.word || word,
      reading: entry.phonetic,
      senses: senses.slice(0, 5),
      examples: examples.slice(0, 3),
      source: "Cambridge 风格 / Free Dictionary",
      query: word,
    };
  } catch {
    return null;
  }
}

async function lookupRomanceWord(
  query: string,
  language: "es" | "fr",
  sourceLabel: string
): Promise<DictionaryLookup | null> {
  const word = normalizeQuery(query).split(/\s+/)[0];
  if (!word || word.length < 2) return null;

  const zh = await translateToZh(word, language);
  if (!zh || !hasChineseText(zh)) return null;

  return {
    headword: word,
    senses: [{ glossEn: [zh], partOfSpeech: [] }],
    examples: [],
    source: sourceLabel,
    query: word,
  };
}

export async function lookupDictionary(
  text: string,
  language: string
): Promise<DictionaryLookup | null> {
  if (language === "ja") {
    return lookupJisho(text);
  }
  if (language === "en") {
    return lookupFreeDictionary(text);
  }
  if (language === "es") {
    const hit = await lookupRomanceWord(
      text,
      "es",
      "SpanishDict / CuteSlator / esdict 风格"
    );
    if (hit) return hit;
    return lookupFreeDictionary(text);
  }
  if (language === "fr") {
    const hit = await lookupRomanceWord(
      text,
      "fr",
      "CuteSlator / Frdic 风格"
    );
    if (hit) return hit;
    return lookupFreeDictionary(text);
  }
  const en = await lookupFreeDictionary(text);
  return en;
}
