"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  NotebookCard,
  MaterialMarks,
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
  source: "listen-mark" | "notebook" | "weak";
  language: SupportedLanguage;
  errorCount?: number;
}

function inferLanguageFromText(text: string): SupportedLanguage | null {
  if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(text)) return "ja";
  if (/[áéíóúñü¿¡]/i.test(text)) return "es";
  if (/[àâçéèêëîïôùûüœæ]/i.test(text)) return "fr";
  if (/[a-zA-Z]/.test(text)) return "en";
  return null;
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

    const materials: MaterialIndexEntry[] = materialsRes.materials ?? [];
    const langByMaterialId = new Map(
      materials.map((m) => [
        m.id,
        sourceLangFromMaterial(m.id, m.sourceLang) as SupportedLanguage,
      ])
    );

    for (const m of materials) {
      const marks: MaterialMarks = marksRes[m.id];
      if (!marks) continue;
      const materialLang = langByMaterialId.get(m.id) ?? m.sourceLang;
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
            language: materialLang,
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
            language: materialLang,
          });
      }
    }

    for (const card of strugglingRes as NotebookCard[]) {
      add({
        text: card.front,
        translation: card.back,
        source: "notebook",
        language: card.language,
      });
    }

    for (const w of weakRes) {
      const fromMaterial = w.materialId
        ? langByMaterialId.get(w.materialId)
        : undefined;
      const lang =
        fromMaterial ?? inferLanguageFromText(w.text) ?? ("ja" as SupportedLanguage);
      add({
        text: w.text,
        translation: w.translation,
        source: "weak",
        language: lang,
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
    const required = filteredItems.slice(0, 8);
    if (!required.length) {
      setFeedback(`当前语种（${langLabel(language)}）暂无薄弱词/句，请先标记或复习。`);
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
        `很好！在${langLabel(language)}写作中使用了 ${used.length}/${required.length} 个薄弱词/句。`
      );
    } else {
      setFeedback(
        `请使用更多${langLabel(language)}标记词/句。已用：${used.map((u) => u.text).join(", ") || "无"}。缺少：${missing.map((m) => m.text).join(", ")}`
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
            选择语种后，薄弱词/句与写作检查均对应该目标语言
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
            必须使用的薄弱词/句（{langLabel(language)}）
          </CardTitle>
          <CardDescription>
            左侧为目标语原文，右侧为中文释义提示
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredItems.length === 0 ? (
            <p className="text-muted-foreground">
              当前语种暂无薄弱项。请先在听模块标记{langLabel(language)}
              句型/词汇，或在 Notebook 中复习并选择 Again/Hard。
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
