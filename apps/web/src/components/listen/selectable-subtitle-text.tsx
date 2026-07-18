"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { guessLemmaKey } from "@/lib/lemma-keys";
import type { SupportedLanguage } from "@langtube/core";

export function tokenizeForSelect(text: string, lang: string): string[] {
  const t = text.trim();
  if (!t) return [];
  if (lang === "ja") {
    return (
      t.match(/[\u3040-\u30ff\u4e00-\u9fff々〆ヶー]+|[A-Za-z0-9]+|[^\s]/g) ??
      []
    );
  }
  return t.match(/[A-Za-zÀ-ÿĀ-ž'\u2019\u2018]+|\d+|[^\s]/g) ?? [];
}

function isSelectableToken(token: string, lang: string): boolean {
  if (lang === "ja") {
    return /[\u3040-\u30ff\u4e00-\u9fffA-Za-z]/.test(token) && token.length >= 1;
  }
  return /^[A-Za-zÀ-ÿĀ-ž'\u2019\u2018]+$/i.test(token) && token.length >= 2;
}

export type ParsedWordState =
  | { kind: "local" }
  | { kind: "global"; materialTitle: string };

type SelectSegment = {
  surface: string;
  lemma: string;
  selectable: boolean;
};

const jaSegmentCache = new Map<string, SelectSegment[]>();

type Props = {
  text: string;
  lang: SupportedLanguage;
  selectedWords: Set<string>;
  parsedStates: Map<string, ParsedWordState>;
  onSelectWord: (word: string, lineId?: string, lemma?: string) => void;
  onDeselectWord: (word: string, lemma?: string) => void;
  lineId?: string;
  className?: string;
};

function lemmaKeyForToken(
  token: string,
  lang: SupportedLanguage,
  lemma?: string
): string {
  if (lang === "ja") return lemma?.trim() || token;
  return guessLemmaKey(token, lang);
}

function selectionKeyForWord(
  word: string,
  lang: SupportedLanguage,
  lemma?: string
): string {
  return lemmaKeyForToken(word, lang, lemma);
}

function isWordSelected(
  lemma: string,
  lang: SupportedLanguage,
  selectedWords: Set<string>
): boolean {
  const key = selectionKeyForWord(lemma, lang, lemma);
  return selectedWords.has(key);
}

/** 将字幕句拆成可点选单词；已解析词不可选，连点两下取消待选 */
export function SelectableSubtitleText({
  text,
  lang,
  selectedWords,
  parsedStates,
  onSelectWord,
  onDeselectWord,
  lineId,
  className,
}: Props) {
  const [jaSegments, setJaSegments] = useState<SelectSegment[] | null>(null);
  const tokens = useMemo(() => tokenizeForSelect(text, lang), [text, lang]);
  const lastClickRef = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    if (lang !== "ja" || !text.trim()) {
      setJaSegments(null);
      return;
    }
    const cached = jaSegmentCache.get(text);
    if (cached) {
      setJaSegments(cached);
      return;
    }
    let cancelled = false;
    void fetch("/api/japanese/tokenize-words", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const segments = (data.segments ?? []) as SelectSegment[];
        jaSegmentCache.set(text, segments);
        setJaSegments(segments);
      })
      .catch(() => {
        if (!cancelled) setJaSegments(null);
      });
    return () => {
      cancelled = true;
    };
  }, [text, lang]);

  const segments = useMemo((): SelectSegment[] => {
    if (lang === "ja" && jaSegments?.length) return jaSegments;
    return tokens.map((surface) => ({
      surface,
      lemma: lemmaKeyForToken(surface, lang),
      selectable: isSelectableToken(surface, lang),
    }));
  }, [lang, jaSegments, tokens]);

  function handleWordClick(segment: SelectSegment, e: MouseEvent) {
    e.stopPropagation();
    const { surface, lemma } = segment;
    const key = selectionKeyForWord(surface, lang, lemma);
    const parsed = parsedStates.get(key);
    if (parsed) return;

    const selected = isWordSelected(lemma, lang, selectedWords);
    const now = Date.now();
    const last = lastClickRef.current;
    if (last && last.key === key && now - last.at < 400 && selected) {
      onDeselectWord(surface, lemma);
      lastClickRef.current = null;
      return;
    }
    lastClickRef.current = { key, at: now };

    if (selected) return;
    onSelectWord(surface, lineId, lemma);
  }

  return (
    <p className={cn("font-medium leading-relaxed", className)}>
      {segments.map((segment, i) => {
        const { surface, lemma, selectable } = segment;
        if (!selectable) {
          return (
            <span key={`${i}-${surface}`} className="text-foreground/90">
              {surface}
            </span>
          );
        }

        const key = selectionKeyForWord(surface, lang, lemma);
        const parsed = parsedStates.get(key);
        const selected = isWordSelected(lemma, lang, selectedWords);

        if (parsed) {
          const title =
            parsed.kind === "local"
              ? "已解析展示（本素材词汇表）"
              : `已解析展示（${parsed.materialTitle}）`;
          return (
            <span
              key={`${i}-${surface}`}
              className="mx-0.5 cursor-default rounded bg-emerald-500/25 px-0.5 text-emerald-100"
              title={title}
            >
              {surface}
            </span>
          );
        }

        return (
          <button
            key={`${i}-${surface}`}
            type="button"
            className={cn(
              "mx-0.5 rounded px-0.5 transition-colors",
              selected
                ? "bg-amber-400 text-black"
                : "hover:bg-white/20 hover:underline"
            )}
            title={
              selected
                ? "连点两下取消选中"
                : lemma !== surface
                  ? `点选以解析：${lemma}`
                  : "点选以解析此词"
            }
            onClick={(e) => handleWordClick(segment, e)}
          >
            {surface}
          </button>
        );
      })}
    </p>
  );
}
