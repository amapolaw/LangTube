"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type MaterialCard = {
  id: string;
  title: string;
  sourceLang: string;
  patternCount: number;
};

/** 读：仅展示听辨页「句型 / 语法」中已有内容的素材 */
export default function ReadIndexPage() {
  const [materials, setMaterials] = useState<MaterialCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const idx = await fetch("/api/materials").then((r) => r.json());
      const list: { id: string; title: string; sourceLang: string }[] =
        idx.materials ?? [];
      const withPatterns: MaterialCard[] = [];
      await Promise.all(
        list.map(async (m) => {
          const pack = await fetch(`/api/materials/${encodeURIComponent(m.id)}`).then(
            (r) => r.json()
          );
          const patternCount = pack.manifest?.patterns?.length ?? 0;
          if (patternCount > 0) {
            withPatterns.push({
              id: m.id,
              title: m.title,
              sourceLang: m.sourceLang,
              patternCount,
            });
          }
        })
      );
      withPatterns.sort((a, b) => a.title.localeCompare(b.title, "zh"));
      setMaterials(withPatterns);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">读 — 影子跟读</h1>
      <p className="text-muted-foreground">
        练习内容来自听辨页「句型 / 语法」。请先在听辨中勾选字幕句并解析句型。
      </p>
      {loading && (
        <p className="text-sm text-muted-foreground">加载中…</p>
      )}
      {!loading && materials.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          暂无句型素材。请到{" "}
          <Link href="/listen" className="text-primary underline">
            听辨
          </Link>{" "}
          勾选字幕并解析句型后再来。
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {materials.map((m) => (
          <Link key={m.id} href={`/read/shadow/${m.id}`}>
            <Card className="transition hover:border-primary">
              <CardHeader>
                <CardTitle>{m.title}</CardTitle>
                <CardDescription>
                  {m.sourceLang.toUpperCase()} · {m.patternCount} 条句型
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
