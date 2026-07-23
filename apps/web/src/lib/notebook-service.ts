import fs from "fs";
import path from "path";
import {
  createCard,
  reviewCard,
  getDueCards,
  type NotebookCard,
  type ReviewRating,
  type WeakItem,
} from "@langtube/core";
import { getUserDir } from "./paths";
import { randomUUID } from "crypto";

function getNotebookPath() {
  return path.join(getUserDir(), "notebook.json");
}

function getWeakItemsPath() {
  return path.join(getUserDir(), "weak-items.json");
}

function getDrillSessionsPath() {
  return path.join(getUserDir(), "drill-sessions.json");
}

function getShadowSessionsPath() {
  return path.join(getUserDir(), "shadow-sessions.json");
}

function getAssessmentPath() {
  return path.join(getUserDir(), "assessments.json");
}

function ensureUserDir() {
  const dir = getUserDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson<T>(filePath: string, fallback: T): T {
  ensureUserDir();
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown) {
  ensureUserDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function getAllCards(): NotebookCard[] {
  return readJson<NotebookCard[]>(getNotebookPath(), []);
}

export function getDueNotebookCards(
  limit?: number,
  language?: string
): NotebookCard[] {
  let cards = getDueCards(getAllCards());
  if (language && language !== "all") {
    cards = cards.filter((c) => c.language === language);
  }
  return limit ? cards.slice(0, limit) : cards;
}

export function getCardsByLanguage(language?: string): NotebookCard[] {
  const cards = getAllCards();
  if (!language || language === "all") return cards;
  return cards.filter((c) => c.language === language);
}

export function addNotebookCard(
  partial: Parameters<typeof createCard>[0]
): NotebookCard {
  const card = createCard(partial);
  const cards = getAllCards();
  cards.push(card);
  writeJson(getNotebookPath(), cards);
  return card;
}

export function updateNotebookCard(
  id: string,
  patch: Partial<NotebookCard>
): NotebookCard | null {
  const cards = getAllCards();
  const index = cards.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const updated = { ...cards[index], ...patch, id: cards[index].id };
  cards[index] = updated;
  writeJson(getNotebookPath(), cards);
  return updated;
}

export function saveAllCards(cards: NotebookCard[]) {
  writeJson(getNotebookPath(), cards);
}

export function rateCard(id: string, rating: ReviewRating): NotebookCard | null {
  const cards = getAllCards();
  const index = cards.findIndex((c) => c.id === id);
  if (index < 0) return null;

  const updated = { ...reviewCard(cards[index], rating), lastRating: rating };
  cards[index] = updated;
  writeJson(getNotebookPath(), cards);
  return updated;
}

export function getStrugglingCards(limit = 20): NotebookCard[] {
  return getAllCards()
    .filter((c) => c.lastRating === "again" || c.lastRating === "hard")
    .slice(0, limit);
}

export function addWeakItem(
  item: Omit<WeakItem, "id" | "errorCount" | "lastSeen"> & { id?: string }
) {
  const items = readJson<WeakItem[]>(getWeakItemsPath(), []);
  const existing = items.find((w) => w.text === item.text);
  const now = new Date().toISOString();

  if (existing) {
    existing.errorCount += 1;
    existing.lastSeen = now;
  } else {
    items.push({
      id: item.id ?? randomUUID(),
      text: item.text,
      translation: item.translation,
      source: item.source,
      materialId: item.materialId,
      errorCount: 1,
      lastSeen: now,
    });
  }

  writeJson(getWeakItemsPath(), items);
}

export function getWeakItems(limit = 20): WeakItem[] {
  const items = readJson<WeakItem[]>(getWeakItemsPath(), []);
  return items
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, limit);
}

export function saveDrillSession(session: {
  materialId?: string;
  drillType: string;
  drillId: string;
  round: number;
  prompt: string;
  response?: string;
  expected: string;
  responseTimeMs?: number;
  correct?: boolean;
  timedOut?: boolean;
}) {
  const sessions = readJson<unknown[]>(getDrillSessionsPath(), []);
  sessions.push({
    id: randomUUID(),
    ...session,
    createdAt: new Date().toISOString(),
  });
  writeJson(getDrillSessionsPath(), sessions);
}

export function saveShadowSession(session: {
  materialId: string;
  lineId: string;
  transcript: string;
  userSpeech?: string;
  similarity?: number;
}) {
  const sessions = readJson<unknown[]>(getShadowSessionsPath(), []);
  sessions.push({
    id: randomUUID(),
    ...session,
    createdAt: new Date().toISOString(),
  });
  writeJson(getShadowSessionsPath(), sessions);
}

export function saveAssessmentResult(result: {
  language: string;
  score: number;
  level: string;
  details?: Record<string, unknown>;
}) {
  const results = readJson<unknown[]>(getAssessmentPath(), []);
  results.push({
    id: randomUUID(),
    ...result,
    details: result.details ?? {},
    createdAt: new Date().toISOString(),
  });
  writeJson(getAssessmentPath(), results);
}

export function getLatestAssessment(language: string) {
  const results = readJson<
    { language: string; createdAt: string; score: number; level: string }[]
  >(getAssessmentPath(), []);
  return results
    .filter((r) => r.language === language)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
}
