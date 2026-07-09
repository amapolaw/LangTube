"use client";

import { useEffect, useState } from "react";
import type { NotebookCard, MaterialMarks } from "@langtube/core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const TOPICS = [
  "心理学与行为",
  "网络安全",
  "欧洲中东历史",
  "宗教与哲学",
  "社会工程学",
  "神秘学与符号",
  "日常生活",
  "旅行经历",
];

interface PracticeItem {
  text: string;
  translation: string;
  source: "listen-mark" | "notebook" | "weak";
  errorCount?: number;
}

export default function WritePracticePage() {
  const [items, setItems] = useState<PracticeItem[]>([]);
  const [topic, setTopic] = useState("");
  const [writing, setWriting] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    loadItems();
    setTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)]);
  }, []);

  async function loadItems() {
    const [weakRes, strugglingRes, marksRes, materialsRes] = await Promise.all([
      fetch("/api/notebook?weak=true").then((r) => r.json()),
      fetch("/api/notebook?struggling=true").then((r) => r.json()),
      fetch("/api/marks").then((r) => r.json()),
      fetch("/api/materials").then((r) => r.json()),
    ]);

    const merged: PracticeItem[] = [];
    const seen = new Set<string>();

    function add(item: PracticeItem) {
      const key = item.text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    }

    const materials = materialsRes.materials ?? [];
    for (const m of materials) {
      const marks: MaterialMarks = marksRes[m.id];
      if (!marks) continue;
      const pack = await fetch(`/api/materials/${m.id}`).then((r) => r.json());
      for (const pid of marks.patterns ?? []) {
        const p = pack.manifest?.patterns?.find(
          (x: { id: string }) => x.id === pid
        );
        if (p)
          add({
            text: p.pattern,
            translation: p.zh,
            source: "listen-mark",
          });
      }
      for (const vid of marks.vocabulary ?? []) {
        const v = pack.manifest?.vocabulary?.find(
          (x: { id: string }) => x.id === vid
        );
        if (v)
          add({
            text: v.word,
            translation: v.zh,
            source: "listen-mark",
          });
      }
    }

    for (const card of strugglingRes as NotebookCard[]) {
      add({
        text: card.front,
        translation: card.back,
        source: "notebook",
      });
    }

    for (const w of weakRes) {
      add({
        text: w.text,
        translation: w.translation,
        source: "weak",
        errorCount: w.errorCount,
      });
    }

    setItems(merged);
  }

  function shuffleTopic() {
    setTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)]);
  }

  const sourceLabel = {
    "listen-mark": "听-标记",
    notebook: "Notebook",
    weak: "练习错误",
  };

  function checkWriting() {
    const required = items.slice(0, 8);
    const used = required.filter((w) =>
      writing.toLowerCase().includes(w.text.toLowerCase())
    );
    const missing = required.filter(
      (w) => !writing.toLowerCase().includes(w.text.toLowerCase())
    );

    if (used.length >= 3) {
      setFeedback(`很好！使用了 ${used.length}/${required.length} 个薄弱词/句。`);
    } else {
      setFeedback(
        `请使用更多标记词/句。已用：${used.map((u) => u.text).join(", ") || "无"}。缺少：${missing.map((m) => m.text).join(", ")}`
      );
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">写 — 主题写作练习</h1>

      <Card>
        <CardHeader>
          <CardTitle>随机主题</CardTitle>
          <CardDescription>
            优先使用听模块标记句型与 Notebook Again/Hard 卡片
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-primary/10 px-4 py-2 text-lg font-medium">
              {topic}
            </span>
            <Button size="sm" variant="outline" onClick={shuffleTopic}>
              换主题
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">必须使用的薄弱词/句</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-muted-foreground">
              请先在听模块标记句型/词汇，或在 Notebook 中复习并选择 Again/Hard。
            </p>
          ) : (
            <ul className="space-y-2">
              {items.slice(0, 12).map((w, i) => (
                <li key={i} className="flex justify-between gap-2 text-sm">
                  <div>
                    <span className="font-medium">{w.text}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      [{sourceLabel[w.source]}]
                    </span>
                  </div>
                  <span className="shrink-0 text-muted-foreground">
                    {w.translation}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Textarea
        rows={8}
        placeholder="在此写作..."
        value={writing}
        onChange={(e) => setWriting(e.target.value)}
      />

      <Button onClick={checkWriting} disabled={!writing.trim()}>
        提交检查
      </Button>

      {feedback && (
        <Card>
          <CardContent className="pt-4">{feedback}</CardContent>
        </Card>
      )}
    </div>
  );
}
