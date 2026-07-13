"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { MaterialIndexEntry, SupportedLanguage } from "@langtube/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { MaterialResourceUpload } from "@/components/material-resource-upload";
import {
  MATERIAL_LANGUAGES,
  MATERIAL_LEVELS,
  defaultLevelForLang,
  sourceLangFromMaterial,
} from "@/lib/material-form";

function parseStatusLabel(status: MaterialIndexEntry["parseStatus"]): string {
  switch (status) {
    case "ready":
      return "已解析";
    case "processing":
      return "解析中…";
    default:
      return "待完善";
  }
}

function langLabel(lang: string): string {
  return MATERIAL_LANGUAGES.find((l) => l.value === lang)?.label ?? lang;
}

function ListenListContent({
  initialMaterials,
}: {
  initialMaterials: MaterialIndexEntry[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const newMaterialId = searchParams.get("new");

  const [materials, setMaterials] = useState(initialMaterials);
  const [createOpen, setCreateOpen] = useState(false);
  const [batchParsing, setBatchParsing] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const [title, setTitle] = useState("");
  const [sourceLang, setSourceLang] = useState("ja");
  const [level, setLevel] = useState("N3");
  const [learningGoal, setLearningGoal] = useState("general");

  useEffect(() => {
    setMaterials(initialMaterials);

    const hasProcessing = initialMaterials.some(
      (m) => m.parseStatus === "processing"
    );
    if (hasProcessing) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);

    fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pull" }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.skipped) return;
        if (d.pulled > 0 || d.message?.includes("恢复")) {
          router.refresh();
        }
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
  }, [initialMaterials, router]);

  useEffect(() => {
    const hasProcessing = materials.some((m) => m.parseStatus === "processing");
    if (!hasProcessing) return;

    const timer = setInterval(() => {
      router.refresh();
    }, 12_000);
    return () => clearInterval(timer);
  }, [materials, router]);

  useEffect(() => {
    if (newMaterialId) {
      router.refresh();
    }
  }, [newMaterialId, router]);

  async function handleParseAllOffline() {
    if (
      !confirm(
        "稳妥模式：逐条解析全部卡片，不调用 Cursor LLM，仅用规则+词典。速度较慢但更稳定，是否继续？"
      )
    ) {
      return;
    }
    setBatchParsing(true);
    setBatchMessage("正在排队稳妥离线解析（逐条串行）…");
    try {
      const res = await fetch("/api/materials/parse-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true, mode: "offline", sequential: true }),
      });
      const data = await res.json();
      setBatchMessage(data.message || "已触发稳妥离线解析");
      router.refresh();
    } catch {
      setBatchMessage("稳妥离线解析请求失败");
    } finally {
      setBatchParsing(false);
    }
  }

  async function handleParseAll() {
    if (
      !confirm(
        "将对全部学习卡片执行全量解析（字幕→词汇→句型），已解析的也会按新规则重新生成。耗时可能较长，是否继续？"
      )
    ) {
      return;
    }
    setBatchParsing(true);
    setBatchMessage("正在排队全量解析…");
    try {
      const res = await fetch("/api/materials/parse-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      setBatchMessage(data.message || "已触发全量解析");
      router.refresh();
    } catch {
      setBatchMessage("全量解析请求失败");
    } finally {
      setBatchParsing(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("确定删除此学习资料？")) return;
    await fetch(`/api/materials/${id}`, { method: "DELETE" });
    setMaterials((m) => m.filter((x) => x.id !== id));
  }

  async function handleCreate() {
    const res = await fetch("/api/materials/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || "Untitled", sourceLang, level, learningGoal }),
    });
    const data = await res.json();
    if (data.id) {
      setCreateOpen(false);
      router.push(`/listen/${data.id}`);
    }
  }

  function renderCard(m: MaterialIndexEntry) {
    const isNew = newMaterialId === m.id;
    const isProcessing = m.parseStatus === "processing";
    const displayLang = sourceLangFromMaterial(m.id, m.sourceLang);

    return (
      <Card
        key={m.id}
        className={cn(
          "relative flex h-full flex-col transition",
          isProcessing ? "opacity-70" : "hover:border-primary",
          isNew && "border-primary ring-2 ring-primary/30"
        )}
      >
        <Button
          size="icon"
          variant="ghost"
          className="absolute right-2 top-2 z-10 h-8 w-8 text-destructive"
          onClick={(e) => handleDelete(e, m.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        {isNew && (
          <span className="absolute left-3 top-3 z-10 rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            新导入
          </span>
        )}
        {isProcessing ? (
          <Link href={`/listen/${m.id}`} className="flex-1">
            <CardHeader className={cn("flex-1", isNew && "pt-8")}>
              <CardTitle>{m.title}</CardTitle>
              <CardDescription>
                {langLabel(displayLang)} · {m.level} · 解析中…（可点击进入）
              </CardDescription>
            </CardHeader>
          </Link>
        ) : (
          <Link href={`/listen/${m.id}`} className="flex-1">
            <CardHeader className={cn(isNew && "pt-8")}>
              <CardTitle>{m.title}</CardTitle>
              <CardDescription>
                {langLabel(displayLang)} · {m.level} ·{" "}
                {parseStatusLabel(m.parseStatus)}
              </CardDescription>
            </CardHeader>
          </Link>
        )}
        <CardContent className="flex flex-col items-stretch gap-2 border-t pt-4">
          <p className="text-xs text-muted-foreground">资源上传 / 调整</p>
          <MaterialResourceUpload
            material={{
              ...m,
              sourceLang: displayLang as SupportedLanguage,
            }}
            showSettingsLink={!isProcessing}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">听 — 选择学习资料</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={batchParsing || materials.length === 0}
            onClick={handleParseAllOffline}
          >
            {batchParsing ? "解析中…" : "稳妥逐条解析"}
          </Button>
          <Button
            variant="secondary"
            disabled={batchParsing || materials.length === 0}
            onClick={handleParseAll}
          >
            {batchParsing ? "全量解析中…" : "全量解析全部"}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建学习卡片
          </Button>
        </div>
      </div>
      {batchMessage && (
        <p className="text-sm text-muted-foreground">{batchMessage}</p>
      )}

      {materials.length === 0 ? (
        <Card>
          <CardHeader className="text-center">
            <CardDescription>暂无资料</CardDescription>
            <Button className="mt-2" onClick={() => setCreateOpen(true)}>
              新建学习卡片
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {materials.map((m) => renderCard(m))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建学习卡片</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>标题</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>目标语言</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border px-3 text-sm"
                value={sourceLang}
                onChange={(e) => {
                  setSourceLang(e.target.value);
                  setLevel(defaultLevelForLang(e.target.value));
                }}
              >
                {MATERIAL_LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>水平</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border px-3 text-sm"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                {(MATERIAL_LEVELS[sourceLang] ?? MATERIAL_LEVELS.en).map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>学习目的</Label>
              <Input
                value={learningGoal}
                onChange={(e) => setLearningGoal(e.target.value)}
                placeholder="general, film, conversation..."
              />
            </div>
            <Button onClick={handleCreate}>创建并进入</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ListenListClient({
  initialMaterials,
}: {
  initialMaterials: MaterialIndexEntry[];
}) {
  return (
    <Suspense fallback={<div className="py-12 text-center">加载中...</div>}>
      <ListenListContent initialMaterials={initialMaterials} />
    </Suspense>
  );
}
