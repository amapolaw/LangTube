import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getDataDir } from "@/lib/paths";
import { getDueNotebookCards } from "@/lib/notebook-service";
import { readContentPack } from "@/lib/data";
import { estimateReadingMinutes } from "@langtube/core";

export async function POST(req: Request) {
  const { materialIds = [], targetMinutes = 30 } = await req.json();

  const cards = getDueNotebookCards(50);
  const sections: string[] = [
    "# LangTube 通勤复习",
    `生成时间：${new Date().toLocaleString("zh-CN")}`,
    `预计阅读：${targetMinutes} 分钟`,
    "",
    "## 今日复习卡片",
    "",
  ];

  for (const card of cards) {
    sections.push(`### ${card.front}`);
    sections.push(`> ${card.back}`);
    sections.push("");
  }

  for (const id of materialIds.slice(0, 2)) {
    const pack = await readContentPack(id);
    if (!pack) continue;
    sections.push(`## ${pack.manifest.title} — 精听摘要`);
    sections.push("");
    for (const seg of pack.segments.intensive.slice(0, 1)) {
      const lines = pack.transcript.lines.filter(
        (l) => l.start >= seg.start && l.end <= seg.end
      );
      for (const line of lines.slice(0, 10)) {
        sections.push(`- **${line.text}**`);
        sections.push(`  ${line.translation}`);
      }
    }
    sections.push("");
  }

  const markdown = sections.join("\n");
  const minutes = estimateReadingMinutes(markdown);

  const exportDir = path.join(getDataDir(), "exports");
  await fs.mkdir(exportDir, { recursive: true });
  const filename = `commute-${Date.now()}.md`;
  const filePath = path.join(exportDir, filename);
  await fs.writeFile(filePath, markdown, "utf-8");

  return NextResponse.json({
    markdown,
    filePath,
    estimatedMinutes: minutes,
    cardCount: cards.length,
  });
}
