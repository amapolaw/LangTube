import type { NotebookCard, ReviewRating } from "./types.js";

/** SM-2 spaced repetition algorithm */
export function reviewCard(
  card: NotebookCard,
  rating: ReviewRating
): NotebookCard {
  const now = new Date().toISOString();
  let { easeFactor, interval, repetitions } = card;

  const qualityMap: Record<ReviewRating, number> = {
    again: 1,
    hard: 3,
    good: 4,
    easy: 5,
  };
  const q = qualityMap[rating];

  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  }

  easeFactor = Math.max(
    1.3,
    easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  );

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return {
    ...card,
    easeFactor,
    interval,
    repetitions,
    nextReview: nextReview.toISOString(),
    lastReview: now,
  };
}

export function createCard(
  partial: Pick<NotebookCard, "type" | "front" | "back" | "language"> &
    Partial<NotebookCard>
): NotebookCard {
  const now = new Date().toISOString();
  return {
    ...partial,
    id: partial.id ?? `card-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    tags: partial.tags ?? [],
    easeFactor: partial.easeFactor ?? 2.5,
    interval: partial.interval ?? 0,
    repetitions: partial.repetitions ?? 0,
    nextReview: partial.nextReview ?? now,
    createdAt: partial.createdAt ?? now,
  };
}

export function getDueCards(cards: NotebookCard[]): NotebookCard[] {
  const now = new Date();
  return cards
    .filter((c) => new Date(c.nextReview) <= now)
    .sort(
      (a, b) =>
        new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime()
    );
}

export function estimateReadingMinutes(text: string): number {
  const chars = text.length;
  return Math.ceil(chars / 400);
}
