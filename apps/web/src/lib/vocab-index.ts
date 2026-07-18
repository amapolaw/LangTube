import type { SupportedLanguage, VocabularyItem } from "@langtube/core";
import { readIndex, readContentPack } from "@/lib/data";
import { guessLemmaKey, vocabKey } from "@/lib/lemma-keys";

export type VocabIndexHit = {
  key: string;
  word: string;
  materialId: string;
  materialTitle: string;
};

function itemKeys(v: VocabularyItem, lang: SupportedLanguage): string[] {
  const keys = new Set<string>();
  const lemma = v.lemma?.trim() || v.word.trim();
  if (lemma) keys.add(vocabKey(lemma, lang));
  if (v.word.trim()) keys.add(vocabKey(v.word, lang));
  if (v.word.trim() && lang !== "ja") {
    keys.add(guessLemmaKey(v.word, lang));
  }
  return [...keys].filter(Boolean);
}

/** 全库词汇索引：用于「已在其他视频解析」判定 */
export async function buildVocabularyIndex(): Promise<VocabIndexHit[]> {
  const index = await readIndex();
  const hits: VocabIndexHit[] = [];
  const seen = new Set<string>();

  for (const m of index.materials) {
    let pack;
    try {
      pack = await readContentPack(m.id);
    } catch {
      continue;
    }
    if (!pack) continue;
    const lang = pack.manifest.sourceLang as SupportedLanguage;
    for (const v of pack.manifest.vocabulary ?? []) {
      if (!v.word?.trim()) continue;
      const display = (v.lemma?.trim() || v.word).trim();
      for (const key of itemKeys(v, lang)) {
        const dedupe = `${key}\0${m.id}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        hits.push({
          key,
          word: display,
          materialId: m.id,
          materialTitle: pack.manifest.title || m.title,
        });
      }
    }
  }

  return hits;
}
