"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  SupportedLanguage,
  MaterialIndexEntry,
} from "@langtube/core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MATERIAL_LANGUAGES,
  sourceLangFromMaterial,
} from "@/lib/material-form";

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
  source: "listen-vocab" | "listen-pattern";
  language: SupportedLanguage;
  errorCount?: number;
}

function langLabel(lang: SupportedLanguage): string {
  return MATERIAL_LANGUAGES.find((l) => l.value === lang)?.label ?? lang;
}

export default function WritePracticePage() {
  const [items, setItems] = useState<PracticeItem[]>([]);
  const [language, setLanguage] = useState<SupportedLanguage>("ja");
  const [topic, setTopic] = useState("");
  const [writing, setWriting] = useState("");
  const [feedback, setFeedback] = useState("");

  const filteredItems = useMemo(
    () => items.filter((item) => item.language === language),
    [items, language]
  );

  useEffect(() => {
    void (async () => {
      const settings = await fetch("/api/settings").then((r) => r.json());
      if (settings?.targetLang) {
        setLanguage(settings.targetLang as SupportedLanguage);
      }
    })();
    loadItems();
    setTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)]);
  }, []);

  async function loadItems() {
    const materialsRes = await fetch("/api/materials").then((r) => r.json());
    const materials: MaterialIndexEntry[] = materialsRes.materials ?? [];

    const merged: PracticeItem[] = [];
    const seen = new Set<string>();

    function add(item: PracticeItem) {
      const key = item.text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    }

    for (const m of materials) {
      const materialLang = sourceLangFromMaterial(
        m.id,
        m.sourceLang
      ) as SupportedLanguage;
      const pack = await fetch(`/api/materials/${m.id}`).then((r) => r.json());
      for (const p of pack.manifest?.patterns ?? []) {
        if (p?.pattern)
          add({
            text: p.pattern,
            translation: p.zh ?? "",
            source: "listen-pattern",
            language: materialLang,
          });
      }
      for (const v of pack.manifest?.vocabulary ?? []) {
        if (v?.word)
          add({
            text: v.word,
            translation: v.zh ?? "",
            source: "listen-vocab",
            language: materialLang,
          });
      }
    }

    setItems(merged);
  }

  function shuffleTopic() {
    setTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)]);
  }

  const sourceLabel = {
    "listen-vocab": "听-词汇表",
    "listen-pattern": "听-句型",
  };

  function checkWriting() {
    const required = filteredItems.slice(0, 8);
    if (!required.length) {
      setFeedback(
        `当前语种（${langLabel(language)}）暂无词汇/句型。请先到听辨页点选解析后再来写作。`
      );
      return;
    }

    const used = required.filter((w) =>
      writing.toLowerCase().includes(w.text.toLowerCase())
    );
    const missing = required.filter(
      (w) => !writing.toLowerCase().includes(w.text.toLowerCase())
    );

    if (used.length >= 3) {
      setFeedback(
        `很好！在${langLabel(language)}写作中使用了 ${used.length}/${required.length} 个听辨词汇/句型。`
      );
    } else {
      setFeedback(
        `请使用更多${langLabel(language)}听辨词汇/句型。已用：${used.map((u) => u.text).join(", ") || "无"}。缺少：${missing.map((m) => m.text).join(", ")}`
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
            选择语种后，练习词句来自听辨页「词汇表」与「句型 / 语法」
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>练习语种</Label>
            <select
              className="mt-1 flex h-10 w-full rounded-md border px-3 text-sm"
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value as SupportedLanguage);
                setFeedback("");
              }}
            >
              {MATERIAL_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
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
          <CardTitle className="text-base">
            必须使用的词汇/句型（{langLabel(language)}）
          </CardTitle>
          <CardDescription>
            来自听辨「词汇表」与「句型 / 语法」；左侧原文，右侧中文提示
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredItems.length === 0 ? (
            <p className="text-muted-foreground">
              当前语种暂无内容。请先到听辨页点选单词/句子并解析{langLabel(language)}
              词汇与句型。
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredItems.slice(0, 12).map((w, i) => (
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
        placeholder={`请用${langLabel(language)}围绕主题写作…`}
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
