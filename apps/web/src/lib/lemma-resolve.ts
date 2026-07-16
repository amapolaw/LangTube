import type { SupportedLanguage } from "@langtube/core";
import { lookupDictionary } from "@/lib/dictionary/lookup";
import { conjugationDictUrl } from "@/lib/parse-rules";
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
  let lemma =
    hit?.headword?.trim() ||
    (lang === "ja" ? raw : guessLemmaKey(raw, lang));

  if (lang !== "ja" && lemma === raw.toLowerCase()) {
    const guessed = guessLemmaKey(raw, lang);
    if (guessed && guessed !== lemma) lemma = guessed;
  }

  const glossEn =
    hit?.senses
      ?.flatMap((s) => s.glossEn ?? [])
      .filter(Boolean)
      .slice(0, 4)
      .join("; ") || undefined;

  return {
    lemma,
    surface: raw,
    reading: hit?.reading,
    partOfSpeech: hit?.senses?.[0]?.partOfSpeech?.join(", ") || undefined,
    glossEn,
    dictUrl: conjugationDictUrl(lang, lemma),
  };
}
