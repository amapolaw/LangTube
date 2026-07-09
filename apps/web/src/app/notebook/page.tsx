"use client";

import { useEffect, useState } from "react";
import type { NotebookCard, ReviewRating } from "@langtube/core";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NotebookPage() {
  const [cards, setCards] = useState<NotebookCard[]>([]);
  const [dueCards, setDueCards] = useState<NotebookCard[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [mode, setMode] = useState<"review" | "browse">("review");

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

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notebook</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={mode === "review" ? "default" : "outline"}
            onClick={() => setMode("review")}
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

      {mode === "review" && (
        <>
          {dueCards.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                今日复习完成！🎉
              </CardContent>
            </Card>
          ) : currentCard ? (
            <Card
              className="min-h-64 cursor-pointer"
              onClick={() => !showBack && setShowBack(true)}
            >
              <CardHeader>
                <CardDescription>
                  {reviewIndex + 1} / {dueCards.length} · {currentCard.type}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex min-h-32 items-center justify-center">
                <p className="text-center text-xl">
                  {showBack ? currentCard.back : currentCard.front}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {showBack && currentCard && (
            <div className="grid grid-cols-4 gap-2">
              <Button variant="destructive" onClick={() => rate("again")}>
                Again
              </Button>
              <Button variant="outline" onClick={() => rate("hard")}>
                Hard
              </Button>
              <Button onClick={() => rate("good")}>
                Good
              </Button>
              <Button variant="secondary" onClick={() => rate("easy")}>
                Easy
              </Button>
            </div>
          )}
        </>
      )}

      {mode === "browse" && (
        <div className="space-y-2">
          {cards.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex justify-between py-3">
                <div>
                  <p className="font-medium">{c.front}</p>
                  <p className="text-sm text-muted-foreground">{c.back}</p>
                </div>
                <span className="text-xs text-muted-foreground">{c.type}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
