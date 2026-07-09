import { NextResponse } from "next/server";
import {
  getAllCards,
  getDueNotebookCards,
  getStrugglingCards,
  addNotebookCard,
  rateCard,
  getWeakItems,
  addWeakItem,
} from "@/lib/notebook-service";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const due = searchParams.get("due") === "true";
  const limit = searchParams.get("limit");

  if (searchParams.get("weak") === "true") {
    return NextResponse.json(getWeakItems(limit ? parseInt(limit) : 20));
  }

  if (searchParams.get("struggling") === "true") {
    return NextResponse.json(
      getStrugglingCards(limit ? parseInt(limit) : 20)
    );
  }

  const cards = due
    ? getDueNotebookCards(limit ? parseInt(limit) : undefined)
    : getAllCards();
  return NextResponse.json(cards);
}

export async function POST(req: Request) {
  const body = await req.json();
  const card = addNotebookCard(body);
  return NextResponse.json(card);
}

export async function PATCH(req: Request) {
  const { id, rating } = await req.json();
  const updated = rateCard(id, rating);
  if (!updated) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function PUT(req: Request) {
  const body = await req.json();
  addWeakItem(body);
  return NextResponse.json({ ok: true });
}
