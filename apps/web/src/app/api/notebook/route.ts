import { NextResponse } from "next/server";
import {
  getAllCards,
  getCardsByLanguage,
  getDueNotebookCards,
  getStrugglingCards,
  addNotebookCard,
  rateCard,
  getWeakItems,
  addWeakItem,
  updateNotebookCard,
} from "@/lib/notebook-service";
import {
  applyEnrichment,
  enrichCardFromDictionary,
  needsDictionaryEnrichment,
} from "@/lib/dictionary/enrich-card";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const due = searchParams.get("due") === "true";
  const limit = searchParams.get("limit");
  const lang = searchParams.get("lang") ?? undefined;

  if (searchParams.get("weak") === "true") {
    return NextResponse.json(getWeakItems(limit ? parseInt(limit) : 20));
  }

  if (searchParams.get("struggling") === "true") {
    return NextResponse.json(
      getStrugglingCards(limit ? parseInt(limit) : 20)
    );
  }

  const cards = due
    ? getDueNotebookCards(
        limit ? parseInt(limit) : undefined,
        lang
      )
    : getCardsByLanguage(lang);
  return NextResponse.json(cards);
}

export async function POST(req: Request) {
  const body = await req.json();

  // 批量 / 单卡词典补全
  if (body?.action === "enrich") {
    const ids: string[] | undefined = body.ids;
    const overwrite = Boolean(body.overwrite);
    const langFilter: string | undefined = body.lang;
    const cards = getAllCards().filter((c) =>
      langFilter ? c.language === langFilter : true
    );
    const targets = cards.filter((c) =>
      ids?.length
        ? ids.includes(c.id)
        : needsDictionaryEnrichment(c)
    );

    let enriched = 0;
    const errors: string[] = [];

    for (const card of targets.slice(0, body.limit ?? 40)) {
      try {
        const result = await enrichCardFromDictionary(card);
        if (!result) {
          errors.push(`${card.front}: 未找到词典条目`);
          continue;
        }
        updateNotebookCard(
          card.id,
          applyEnrichment(card, result, { overwrite })
        );
        enriched += 1;
        // 避免打爆 Jisho 限流（10 req / 10s）
        await new Promise((r) => setTimeout(r, 350));
      } catch (err) {
        errors.push(
          `${card.front}: ${err instanceof Error ? err.message : "失败"}`
        );
      }
    }

    return NextResponse.json({
      ok: true,
      enriched,
      attempted: targets.length,
      errors: errors.slice(0, 10),
      cards: getAllCards(),
    });
  }

  const card = addNotebookCard(body);

  // 新卡自动查权威词典补全背面
  if (needsDictionaryEnrichment(card)) {
    try {
      const result = await enrichCardFromDictionary(card);
      if (result) {
        const updated = updateNotebookCard(
          card.id,
          applyEnrichment(card, result, { overwrite: true })
        );
        return NextResponse.json(updated ?? card);
      }
    } catch (err) {
      console.warn("[notebook] auto-enrich failed:", err);
    }
  }

  return NextResponse.json(card);
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, rating, ...rest } = body;

  if (rating && id) {
    const updated = rateCard(id, rating);
    if (!updated) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  }

  if (id && (rest.back !== undefined || rest.explanation !== undefined)) {
    const updated = updateNotebookCard(id, rest);
    if (!updated) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid PATCH" }, { status: 400 });
}

export async function PUT(req: Request) {
  const body = await req.json();
  addWeakItem(body);
  return NextResponse.json({ ok: true });
}
