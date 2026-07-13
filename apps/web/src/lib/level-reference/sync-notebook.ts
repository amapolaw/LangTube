import type { ContentPack } from "@langtube/core";
import {
  filterPackByLevel,
  lookupJaLexicon,
  type LevelFilterResult,
} from "@/lib/level-reference/filter";
import { ensureCefrLevelFiles } from "@/lib/level-reference/ensure-files";
import {
  getAllCards,
  addNotebookCard,
  updateNotebookCard,
} from "@/lib/notebook-service";
import {
  applyEnrichment,
  enrichCardFromDictionary,
} from "@/lib/dictionary/enrich-card";

export type LevelNotebookSyncResult = {
  filter: LevelFilterResult;
  addedVocab: number;
  addedPatterns: number;
  message: string;
};

/**
 * 按素材等级甄别词汇/句型，写回 manifest，并自动加入 Notebook。
 */
export async function applyLevelFilterAndNotebook(
  pack: ContentPack,
  opts?: { addToNotebook?: boolean; maxNotebookCards?: number }
): Promise<LevelNotebookSyncResult> {
  ensureCefrLevelFiles();

  const lang = pack.manifest.sourceLang;
  const level = pack.manifest.level || (lang === "ja" ? "N3" : "B1");
  const addToNotebook = opts?.addToNotebook !== false;
  const maxCards = opts?.maxNotebookCards ?? 40;

  const filter = filterPackByLevel(
    pack.manifest.vocabulary,
    pack.manifest.patterns,
    lang,
    level
  );

  // 听辨页 manifest 已在 finalizeManifestForListen 中按等级去重；Notebook 使用甄别结果
  pack.manifest.updatedAt = new Date().toISOString();

  const refTag = `level:${filter.targetLevel}`;
  if (!pack.manifest.topics.includes(refTag)) {
    pack.manifest.topics = [...pack.manifest.topics, refTag];
  }

  const notebookVocab =
    filter.keptVocab > 0
      ? filter.vocabulary
      : pack.manifest.vocabulary.slice(0, 20);
  const notebookPatterns =
    filter.patterns.length > 0
      ? filter.patterns
      : pack.manifest.patterns.slice(0, 10);

  let addedVocab = 0;
  let addedPatterns = 0;

  if (addToNotebook) {
    const existing = new Set(
      getAllCards()
        .filter((c) => c.materialId === pack.manifest.id)
        .map((c) => `${c.type}:${c.front}`)
    );

    const vocabSorted = [...notebookVocab].sort((a, b) => {
      const ae = lang === "ja" && lookupJaLexicon(a.word) ? 1 : 0;
      const be = lang === "ja" && lookupJaLexicon(b.word) ? 1 : 0;
      return be - ae || b.sentenceIds.length - a.sentenceIds.length;
    });

    for (const v of vocabSorted) {
      if (addedVocab + addedPatterns >= maxCards) break;
      const key = `vocabulary:${v.word}`;
      if (existing.has(key)) continue;

      const lex = lang === "ja" ? lookupJaLexicon(v.word) : undefined;
      const examples =
        lex?.examples?.length
          ? lex.examples.slice(0, 3)
          : (v.sentenceIds ?? [])
              .slice(0, 2)
              .map((sid) => {
                const line = pack.transcript.lines.find((l) => l.id === sid);
                return line
                  ? line.translation
                    ? `${line.text} / ${line.translation}`
                    : line.text
                  : "";
              })
              .filter(Boolean);

      let card = addNotebookCard({
        type: "vocabulary",
        front: v.word,
        back: v.zh || lex?.zh || "",
        reading: v.reading || lex?.reading,
        partOfSpeech: v.partOfSpeech || lex?.pos,
        explanation: lex?.gloss
          ? lex.gloss.slice(0, 280)
          : v.level
            ? `等级：${v.level}`
            : undefined,
        examples,
        language: lang,
        materialId: pack.manifest.id,
        tags: [
          ...(pack.manifest.topics ?? []),
          filter.targetLevel,
          ...(v.level ? [v.level] : []),
        ].filter(Boolean),
        dictSource: lex?.source,
      });

      if (!card.back?.trim() || !card.examples?.length) {
        try {
          const enrichment = await enrichCardFromDictionary(card);
          if (enrichment) {
            card =
              updateNotebookCard(
                card.id,
                applyEnrichment(card, enrichment, { overwrite: true })
              ) ?? card;
          }
        } catch {
          /* ignore */
        }
      }

      existing.add(key);
      addedVocab += 1;
    }

    for (const p of notebookPatterns.slice(
      0,
      Math.max(0, maxCards - addedVocab)
    )) {
      const key = `pattern:${p.pattern}`;
      if (existing.has(key)) continue;

      addNotebookCard({
        type: "pattern",
        front: p.pattern,
        back: p.zh || "",
        explanation: p.grammar,
        examples: p.examples ?? [],
        language: lang,
        materialId: pack.manifest.id,
        tags: [...(pack.manifest.topics ?? []), filter.targetLevel],
      });
      existing.add(key);
      addedPatterns += 1;
    }
  }

  const refNote =
    filter.references.length > 0
      ? `参考：${filter.references.slice(0, 3).join("、")}`
      : "参考：内置等级词表";

  return {
    filter,
    addedVocab,
    addedPatterns,
    message: `按 ${filter.targetLevel} 甄别 Notebook：${filter.keptVocab} 词 / ${filter.patterns.length} 句；Notebook +${addedVocab} 词 / +${addedPatterns} 句。${refNote}`,
  };
}
