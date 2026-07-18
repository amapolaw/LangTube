"use client";

import type { PatternItem, SupportedLanguage, VocabularyItem } from "@langtube/core";
import { Checkbox } from "@/components/ui/checkbox";
import { hasDisplayableGrammar } from "@/lib/pattern-grammar";
import {
  jaPartOfSpeechLabel,
  patternDisplayZh,
  vocabDisplayZh,
} from "@/lib/japanese-card";
import { Star } from "lucide-react";

type VocabRowProps = {
  item: VocabularyItem;
  lang: SupportedLanguage;
  patternLabel: string;
  selected: boolean;
  marked: boolean;
  onToggleSelect: () => void;
  onToggleMark: () => void;
};

export function ListenVocabCardRow({
  item,
  lang,
  selected,
  marked,
  onToggleSelect,
  onToggleMark,
}: VocabRowProps) {
  const zh = vocabDisplayZh(item, lang);
  const pos =
    lang === "ja" ? jaPartOfSpeechLabel(item.partOfSpeech) : item.partOfSpeech;
  const showLemma =
    lang !== "ja" &&
    item.lemma &&
    item.lemma.toLowerCase() !== item.word.toLowerCase();

  return (
    <label className="flex cursor-pointer items-start gap-2 rounded p-1 hover:bg-muted">
      <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onToggleMark();
        }}
        className={marked ? "text-yellow-500" : "text-muted-foreground"}
      >
        <Star className="h-3 w-3" fill={marked ? "currentColor" : "none"} />
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium">{item.word}</span>
          {item.reading && (
            <span className="text-xs text-muted-foreground">〔{item.reading}〕</span>
          )}
          {pos && (
            <span className="text-xs text-muted-foreground">{pos}</span>
          )}
          {showLemma && (
            <span className="text-xs text-muted-foreground">原型 {item.lemma}</span>
          )}
          {item.isAcronym && (
            <span className="rounded bg-amber-500/15 px-1 text-[10px] text-amber-800 dark:text-amber-200">
              缩写
            </span>
          )}
          {item.isLoanword && (
            <span className="rounded bg-sky-500/15 px-1 text-[10px] text-sky-800 dark:text-sky-200">
              外来语
            </span>
          )}
        </div>
        {zh && (
          <p className="text-sm text-muted-foreground">中文：{zh}</p>
        )}
        {lang !== "ja" && lang !== "es" && lang !== "fr" && item.glossEn && (
          <p className="text-sm text-muted-foreground">英文：{item.glossEn}</p>
        )}
        {lang !== "ja" && lang !== "es" && lang !== "fr" && item.glossJa && (
          <p className="text-sm text-muted-foreground">日文：{item.glossJa}</p>
        )}
        {item.etymology && (
          <p className="text-xs text-muted-foreground">来源：{item.etymology}</p>
        )}
        {item.notes && (
          <p className="text-xs text-muted-foreground">{item.notes}</p>
        )}
        {item.dictUrl && (
          <a
            href={item.dictUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline"
            onClick={(e) => e.stopPropagation()}
          >
            词典 / 词形变化
          </a>
        )}
      </div>
    </label>
  );
}

type PatternRowProps = {
  item: PatternItem;
  lang: SupportedLanguage;
  patternLabel: string;
  selected: boolean;
  marked: boolean;
  onToggleSelect: () => void;
  onToggleMark: () => void;
};

export function ListenPatternCardRow({
  item,
  lang,
  patternLabel,
  selected,
  marked,
  onToggleSelect,
  onToggleMark,
}: PatternRowProps) {
  const zh = patternDisplayZh(item, lang);

  return (
    <label className="flex cursor-pointer items-start gap-2 rounded p-1 hover:bg-muted">
      <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onToggleMark();
        }}
        className={marked ? "text-yellow-500" : "text-muted-foreground"}
      >
        <Star className="h-3 w-3" fill={marked ? "currentColor" : "none"} />
      </button>
      <div className="min-w-0">
        <p className="whitespace-pre-wrap text-sm">{item.pattern}</p>
        {zh && <p className="text-xs text-muted-foreground">中文：{zh}</p>}
        {hasDisplayableGrammar(item.grammar) && (
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">
            {patternLabel}：{item.grammar}
          </p>
        )}
      </div>
    </label>
  );
}
