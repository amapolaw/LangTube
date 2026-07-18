import type { SupportedLanguage } from "@langtube/core";
import { lookupDictionary } from "@/lib/dictionary/lookup";
import { resolveJapaneseLemma } from "@/lib/japanese-tokenize";
import { resolveSpanishLemma } from "@/lib/spanish-lemmatize";
import { resolveFrenchLemma } from "@/lib/french-lemmatize";
import { conjugationDictUrl, frenchDictUrl } from "@/lib/parse-rules";
import { guessLemmaKey } from "@/lib/lemma-keys";

export { guessLemmaKey, vocabKey } from "@/lib/lemma-keys";

export type LemmaResolveResult = {
  lemma: string;
  surface: string;
  reading?: string;
  partOfSpeech?: string;
  glossEn?: string;
  dictUrl?: string;
};

/** 服务端：词典 + 规则，得到字典型 */
export async function resolveLemma(
  surface: string,
  lang: SupportedLanguage
): Promise<LemmaResolveResult> {
  const raw = surface.trim();
  if (!raw) {
    return { lemma: raw, surface: raw };
  }

  const hit = await lookupDictionary(raw, lang);
  let dictHit = hit;
  let lemma =
    hit?.headword?.trim() ||
    (lang === "ja" ? raw : guessLemmaKey(raw, lang));

  let reading = hit?.reading;
  let partOfSpeech = hit?.senses?.[0]?.partOfSpeech?.join(", ") || undefined;

  if (lang === "ja") {
    const ja = await resolveJapaneseLemma(raw);
    lemma = ja.lemma || lemma;
    reading = reading || ja.reading;
    partOfSpeech = partOfSpeech || ja.partOfSpeech;
    const lemmaHit = lemma !== raw ? await lookupDictionary(lemma, lang) : hit;
    if (lemmaHit && lemma !== raw) {
      if (!reading) reading = lemmaHit.reading;
      if (!partOfSpeech) {
        partOfSpeech =
          lemmaHit.senses?.[0]?.partOfSpeech?.join(", ") || undefined;
      }
    }
  } else if (lang === "es") {
    const es = resolveSpanishLemma(raw);
    lemma = es.lemma;
    const lemmaHit = await lookupDictionary(lemma, lang);
    if (lemmaHit?.headword?.trim()) {
      lemma = lemmaHit.headword.trim().toLowerCase();
    }
    if (lemmaHit) {
      dictHit = lemmaHit;
    }
  } else if (lang === "fr") {
    const fr = resolveFrenchLemma(raw);
    lemma = fr.lemma;
    const lemmaHit = await lookupDictionary(lemma, lang);
    if (lemmaHit?.headword?.trim()) {
      lemma = lemmaHit.headword.trim().toLowerCase();
    }
    if (lemmaHit) {
      dictHit = lemmaHit;
    }
  } else if (lemma === raw.toLowerCase()) {
    const guessed = guessLemmaKey(raw, lang);
    if (guessed && guessed !== lemma) lemma = guessed;
  }

  const glossEn =
    dictHit?.senses
      ?.flatMap((s) => s.glossEn ?? [])
      .filter(Boolean)
      .slice(0, 4)
      .join("; ") || undefined;

  return {
    lemma,
    surface: raw,
    reading,
    partOfSpeech,
    glossEn,
    dictUrl: lang === "fr" ? frenchDictUrl(lemma) : conjugationDictUrl(lang, lemma),
  };
}
