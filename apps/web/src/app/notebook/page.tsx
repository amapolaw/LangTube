"use client";

import { useEffect, useMemo, useState } from "react";
import type { NotebookCard, ReviewRating } from "@langtube/core";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  FlipFlashcard,
  BrowseFlipCard,
} from "@/components/notebook/flip-flashcard";

type Direction = "l2-l1" | "l1-l2";

function isIncomplete(card: NotebookCard): boolean {
  const backOk = Boolean(card.back?.trim()) && card.back.trim() !== "句型";
  const explainOk = Boolean(card.explanation?.trim());
  const examplesOk = (card.examples?.length ?? 0) > 0;
  return !backOk || !explainOk || !examplesOk;
}

export default function NotebookPage() {
  const [cards, setCards] = useState<NotebookCard[]>([]);
  const [dueCards, setDueCards] = useState<NotebookCard[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [mode, setMode] = useState<"review" | "browse">("review");
  const [direction, setDirection] = useState<Direction>("l2-l1");
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState("");

  useEffect(() => {
    loadCards();
  }, []);

  async function loadCards() {
    const [all, due] = await Promise.all([
      fetch("/api/notebook").then((r) => r.json()),
      fetch("/api/notebook?due=true").then((r) => r.json()),
    ]);
    setCards(all);
    setDueCards(due);
  }

  const incompleteCount = useMemo(
    () => cards.filter(isIncomplete).length,
    [cards]
  );

  const currentCard = mode === "review" ? dueCards[reviewIndex] : null;

  async function rate(rating: ReviewRating) {
    if (!currentCard) return;
    await fetch("/api/notebook", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: currentCard.id, rating }),
    });
    setShowBack(false);
    if (reviewIndex + 1 >= dueCards.length) {
      await loadCards();
      setReviewIndex(0);
    } else {
      setReviewIndex((i) => i + 1);
    }
  }

  async function enrichFromDictionary() {
    setEnriching(true);
    setEnrichMsg("正在从权威词典补全释义、用法与例句…");
    try {
      const res = await fetch("/api/notebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enrich", limit: 40 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEnrichMsg(data.error || "补全失败");
        return;
      }
      setCards(data.cards ?? []);
      await loadCards();
      setEnrichMsg(
        `已补全 ${data.enriched} 张` +
          (data.errors?.length ? `（${data.errors.length} 张未命中词典）` : "")
      );
    } catch (err) {
      setEnrichMsg(err instanceof Error ? err.message : "补全失败");
    } finally {
      setEnriching(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Notebook</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={mode === "review" ? "default" : "outline"}
            onClick={() => {
              setMode("review");
              setShowBack(false);
            }}
          >
            复习 ({dueCards.length})
          </Button>
          <Button
            size="sm"
            variant={mode === "browse" ? "default" : "outline"}
            onClick={() => setMode("browse")}
          >
            浏览 ({cards.length})
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={direction === "l2-l1" ? "default" : "outline"}
          onClick={() => {
            setDirection("l2-l1");
            setShowBack(false);
          }}
        >
          原文 → 释义
        </Button>
        <Button
          size="sm"
          variant={direction === "l1-l2" ? "default" : "outline"}
          onClick={() => {
            setDirection("l1-l2");
            setShowBack(false);
          }}
        >
          释义 → 原文
        </Button>
        {incompleteCount > 0 && (
          <Button
            size="sm"
            variant="secondary"
            disabled={enriching}
            onClick={enrichFromDictionary}
          >
            {enriching
              ? "词典补全中…"
              : `补全词典释义 (${incompleteCount})`}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        正面为原文；背面为权威词典释义、用法与例句（日语 JMDict / 英语公开词典）。
      </p>
      {enrichMsg && (
        <p className="text-xs text-muted-foreground">{enrichMsg}</p>
      )}

      {mode === "review" && (
        <>
          {dueCards.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                今日复习完成！可切换到「浏览」查看全部卡片。
              </CardContent>
            </Card>
          ) : currentCard ? (
            <>
              <CardDescription className="text-center">
                {reviewIndex + 1} / {dueCards.length}
              </CardDescription>
              <FlipFlashcard
                card={currentCard}
                flipped={showBack}
                onFlip={() => setShowBack((v) => !v)}
                direction={direction}
              />
            </>
          ) : null}

          {showBack && currentCard && (
            <div className="grid grid-cols-4 gap-2">
              <Button variant="destructive" onClick={() => rate("again")}>
                Again
              </Button>
              <Button variant="outline" onClick={() => rate("hard")}>
                Hard
              </Button>
              <Button onClick={() => rate("good")}>Good</Button>
              <Button variant="secondary" onClick={() => rate("easy")}>
                Easy
              </Button>
            </div>
          )}
          {!showBack && currentCard && (
            <p className="text-center text-sm text-muted-foreground">
              先回忆，再点击卡片翻面
            </p>
          )}
        </>
      )}

      {mode === "browse" && (
        <div className="space-y-4">
          {cards.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                暂无卡片。可在「听」模块将词汇/句型加入 Notebook。
              </CardContent>
            </Card>
          ) : (
            cards.map((c) => (
              <BrowseFlipCard key={c.id} card={c} direction={direction} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
