"use client";

import { useMemo, useRef, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { guessLemmaKey } from "@/lib/lemma-keys";

export function tokenizeForSelect(text: string, lang: string): string[] {
  const t = text.trim();
  if (!t) return [];
  if (lang === "ja") {
    return (
      t.match(/[\u3040-\u30ff\u4e00-\u9fff々〆ヶー]+|[A-Za-z0-9]+|[^\s]/g) ??
      []
    );
  }
  return t.match(/[A-Za-zÀ-ÿĀ-ž']+|\d+|[^\s]/g) ?? [];
}

function isSelectableToken(token: string, lang: string): boolean {
  if (lang === "ja") {
    return /[\u3040-\u30ff\u4e00-\u9fffA-Za-z]/.test(token) && token.length >= 1;
  }
  return /^[A-Za-zÀ-ÿĀ-ž']+$/i.test(token) && token.length >= 2;
}

export type ParsedWordState =
  | { kind: "local" }
  | { kind: "global"; materialTitle: string };

type Props = {
  text: string;
  lang: string;
  selectedWords: Set<string>;
  parsedStates: Map<string, ParsedWordState>;
  onSelectWord: (word: string) => void;
  onDeselectWord: (word: string) => void;
  className?: string;
};

function lemmaKeyForToken(token: string, lang: string): string {
  return lang === "ja" ? token : guessLemmaKey(token, lang);
}

/** 将字幕句拆成可点选单词；已解析词不可选，连点两下取消待选 */
export function SelectableSubtitleText({
  text,
  lang,
  selectedWords,
  parsedStates,
  onSelectWord,
  onDeselectWord,
  className,
}: Props) {
  const tokens = useMemo(() => tokenizeForSelect(text, lang), [text, lang]);
  const lastClickRef = useRef<{ key: string; at: number } | null>(null);

  function handleWordClick(token: string, e: MouseEvent) {
    e.stopPropagation();
    const key = lemmaKeyForToken(token, lang);
    const parsed = parsedStates.get(key);
    if (parsed) return;

    const selected = [...selectedWords].some(
      (w) => lemmaKeyForToken(w, lang) === key
    );

    const now = Date.now();
    const last = lastClickRef.current;
    if (
      last &&
      last.key === key &&
      now - last.at < 400 &&
      selected
    ) {
      onDeselectWord(token);
      lastClickRef.current = null;
      return;
    }
    lastClickRef.current = { key, at: now };

    if (selected) return;
    onSelectWord(token);
  }

  return (
    <p className={cn("font-medium leading-relaxed", className)}>
      {tokens.map((token, i) => {
        const selectable = isSelectableToken(token, lang);
        if (!selectable) {
          return (
            <span key={`${i}-${token}`} className="text-foreground/90">
              {token}
              {lang === "ja" ? "" : /[A-Za-zÀ-ÿ]$/.test(token) ? " " : ""}
            </span>
          );
        }

        const key = lemmaKeyForToken(token, lang);
        const parsed = parsedStates.get(key);
        const selected = [...selectedWords].some(
          (w) => lemmaKeyForToken(w, lang) === key
        );

        if (parsed) {
          const title =
            parsed.kind === "local"
              ? "已解析展示（本素材词汇表）"
              : `已解析展示（${parsed.materialTitle}）`;
          return (
            <span
              key={`${i}-${token}`}
              className="mx-0.5 cursor-default rounded bg-emerald-500/25 px-0.5 text-emerald-100"
              title={title}
            >
              {token}
            </span>
          );
        }

        return (
          <button
            key={`${i}-${token}`}
            type="button"
            className={cn(
              "mx-0.5 rounded px-0.5 transition-colors",
              selected
                ? "bg-amber-400 text-black"
                : "hover:bg-white/20 hover:underline"
            )}
            title={selected ? "连点两下取消选中" : "点选以解析此词"}
            onClick={(e) => handleWordClick(token, e)}
          >
            {token}
          </button>
        );
      })}
    </p>
  );
}
