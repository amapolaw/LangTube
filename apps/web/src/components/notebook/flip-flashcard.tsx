"use client";

import { useState } from "react";
import type { NotebookCard } from "@langtube/core";
import {
  getFrontFace,
  parseCardBack,
  typeLabel,
} from "@/lib/notebook-card-content";
import { JapaneseRubyText } from "@/components/japanese-ruby-text";
import { buildReadingMap } from "@/lib/japanese-ruby";
import { cn } from "@/lib/utils";

type Direction = "l2-l1" | "l1-l2";

export function FlipFlashcard({
  card,
  flipped,
  onFlip,
  direction = "l2-l1",
  className,
  footer,
}: {
  card: NotebookCard;
  flipped: boolean;
  onFlip: () => void;
  direction?: Direction;
  className?: string;
  footer?: React.ReactNode;
}) {
  const front = getFrontFace(card, direction);
  const back = parseCardBack(card);
  const isJa = card.language === "ja";
  const readingMap =
    isJa && card.reading
      ? buildReadingMap([{ word: card.front, reading: card.reading }])
      : isJa
        ? buildReadingMap([])
        : undefined;

  return (
    <div className={cn("w-full", className)}>
      <button
        type="button"
        className="group w-full [perspective:1200px]"
        onClick={onFlip}
        aria-label={flipped ? "翻回正面" : "翻到背面"}
      >
        <div
          className={cn(
            "relative min-h-[280px] w-full transition-transform duration-500 [transform-style:preserve-3d]",
            flipped && "[transform:rotateY(180deg)]"
          )}
        >
          {/* 正面 */}
          <div className="absolute inset-0 flex flex-col rounded-xl border bg-card p-6 shadow-sm [backface-visibility:hidden]">
            <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>{typeLabel(card.type)}</span>
              <span>
                {direction === "l2-l1" ? "原文 → 释义" : "释义 → 原文"}
              </span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <p className="text-2xl font-semibold leading-relaxed tracking-wide">
                {isJa && direction === "l2-l1" ? (
                  <JapaneseRubyText
                    text={front.title}
                    readings={readingMap}
                  />
                ) : (
                  front.title
                )}
              </p>
              {front.subtitle && (
                <p className="text-sm text-muted-foreground">{front.subtitle}</p>
              )}
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              {front.hint}
            </p>
          </div>

          {/* 背面 */}
          <div className="absolute inset-0 flex flex-col rounded-xl border border-primary/20 bg-primary/5 p-6 shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>背面</span>
              <span>再点翻回</span>
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto text-left">
              {direction === "l2-l1" ? (
                <>
                  <BackBlock label="释义" emphasize>
                    {back.translation || "（暂无释义）"}
                  </BackBlock>
                  {back.reading && (
                    <BackBlock label="读音">{back.reading}</BackBlock>
                  )}
                  {back.partOfSpeech && (
                    <BackBlock label="词性">{back.partOfSpeech}</BackBlock>
                  )}
                  {back.explanation && (
                    <BackBlock label="用法 / 讲解">{back.explanation}</BackBlock>
                  )}
                  {back.examples.length > 0 && (
                    <BackBlock label="例句">
                      <ul className="list-disc space-y-1 pl-4">
                        {back.examples.map((ex, i) => (
                          <li key={i} className="leading-relaxed">
                            {isJa ? (
                              <JapaneseRubyText
                                text={ex}
                                readings={readingMap}
                              />
                            ) : (
                              ex
                            )}
                          </li>
                        ))}
                      </ul>
                    </BackBlock>
                  )}
                  <BackBlock label="原文">
                    {isJa ? (
                      <JapaneseRubyText
                        text={card.front}
                        readings={readingMap}
                      />
                    ) : (
                      card.front
                    )}
                  </BackBlock>
                  {card.dictSource && (
                    <p className="mt-auto pt-2 text-[10px] text-muted-foreground">
                      来源：{card.dictSource}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <BackBlock label="原文" emphasize>
                    {isJa ? (
                      <JapaneseRubyText
                        text={card.front}
                        readings={readingMap}
                      />
                    ) : (
                      card.front
                    )}
                  </BackBlock>
                  {back.reading && (
                    <BackBlock label="读音">{back.reading}</BackBlock>
                  )}
                  {back.explanation && (
                    <BackBlock label="用法 / 讲解">{back.explanation}</BackBlock>
                  )}
                  {back.examples.length > 0 && (
                    <BackBlock label="例句">
                      <ul className="list-disc space-y-1 pl-4">
                        {back.examples.map((ex, i) => (
                          <li key={i}>{ex}</li>
                        ))}
                      </ul>
                    </BackBlock>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </button>
      {footer}
    </div>
  );
}

function BackBlock({
  label,
  children,
  emphasize,
}: {
  label: string;
  children: React.ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div
        className={cn(
          "text-sm leading-relaxed",
          emphasize && "text-lg font-semibold text-foreground"
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** 浏览模式：独立翻转状态的小卡片 */
export function BrowseFlipCard({
  card,
  direction,
}: {
  card: NotebookCard;
  direction: Direction;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <FlipFlashcard
      card={card}
      flipped={flipped}
      onFlip={() => setFlipped((f) => !f)}
      direction={direction}
      className="min-h-0"
    />
  );
}
