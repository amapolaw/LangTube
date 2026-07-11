import { NextResponse } from "next/server";
import { readIndex } from "@/lib/data";
import { parseMaterial } from "@/lib/material-parser";

export const maxDuration = 300;

let batchRunning = false;

/** 按新解析规则顺序重解析全部素材（force，单线程队列） */
export async function POST() {
  if (batchRunning) {
    return NextResponse.json(
      { message: "批量重解析已在进行中，请稍候" },
      { status: 409 }
    );
  }

  const index = await readIndex();
  const ids = index.materials.map((m) => m.id);
  if (!ids.length) {
    return NextResponse.json({ message: "无素材可解析", total: 0 });
  }

  batchRunning = true;
  void (async () => {
    try {
      for (const id of ids) {
        console.info(`[reparse-all] start ${id}`);
        try {
          const result = await parseMaterial(id, { force: true });
          console.info(
            `[reparse-all] done ${id}: ${result.parseStatus} (${result.lines} lines)`
          );
        } catch (err) {
          console.error(`[reparse-all] failed ${id}:`, err);
        }
      }
      console.info(`[reparse-all] finished ${ids.length} materials`);
    } finally {
      batchRunning = false;
    }
  })();

  return NextResponse.json({
    message: `已启动批量重解析（${ids.length} 个素材，按新规则 force 解析）`,
    total: ids.length,
    ids,
  });
}
