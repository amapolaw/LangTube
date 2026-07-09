"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import type {
  ContentPack,
  MaterialMarks,
  ResolvedMedia,
  VocabularyItem,
  PatternItem,
} from "@langtube/core";
import { formatDuration } from "@langtube/core";
import { resolveMediaClient } from "@/lib/media-resolver";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Star } from "lucide-react";

export default function ListenDetailPage({
  params,
}: {
  params: Promise<{ materialId: string }>;
}) {
  const [materialId, setMaterialId] = useState("");
  const [pack, setPack] = useState<ContentPack | null>(null);
  const [marks, setMarks] = useState<MaterialMarks>({
    lines: [],
    vocabulary: [],
    patterns: [],
    updatedAt: "",
  });
  const [mode, setMode] = useState<"extensive" | "intensive">("extensive");
  const [segmentStart, setSegmentStart] = useState(0);
  const [segmentEnd, setSegmentEnd] = useState(300);
  const [currentLine, setCurrentLine] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [selectedVocab, setSelectedVocab] = useState<Set<string>>(new Set());
  const [selectedPatterns, setSelectedPatterns] = useState<Set<string>>(new Set());
  const [media, setMedia] = useState<ResolvedMedia | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [savingTranscript, setSavingTranscript] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    params.then((p) => {
      setMaterialId(p.materialId);
      loadPack(p.materialId);
    });
  }, [params]);

  async function loadPack(id: string) {
    const [packRes, marksRes] = await Promise.all([
      fetch(`/api/materials/${id}`).then((r) => r.json()),
      fetch(`/api/marks/${id}`).then((r) => r.json()),
    ]);
    setPack(packRes);
    setMarks(marksRes);
    const resolved = resolveMediaClient(
      packRes.storage,
      packRes.manifest?.sourceUrl
    );
    if (resolved.type === "external" && packRes.storage?.url) {
      const fallback = await fetch(
        `/api/media/resolve?url=${encodeURIComponent(packRes.storage.url)}`
      ).then((r) => r.json());
      setMedia(fallback);
    } else {
      setMedia(resolved);
    }
    const seg = packRes.segments?.extensive?.[0];
    if (seg) {
      setSegmentStart(seg.start);
      setSegmentEnd(seg.end);
    }
  }

  const linesInSegment = useMemo(() => {
    if (!pack) return [];
    return pack.transcript.lines.filter(
      (l) => l.start >= segmentStart && l.end <= segmentEnd
    );
  }, [pack, segmentStart, segmentEnd]);

  async function toggleMark(
    category: "lines" | "vocabulary" | "patterns",
    itemId: string
  ) {
    const res = await fetch(`/api/marks/${materialId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", category, itemId }),
    });
    setMarks(await res.json());
  }

  async function addToNotebook() {
    if (!pack) return;
    for (const id of selectedVocab) {
      const v = pack.manifest.vocabulary.find((x) => x.id === id);
      if (v) {
        await fetch("/api/notebook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "vocabulary",
            front: v.word,
            back: v.zh,
            language: pack.manifest.sourceLang,
            materialId: pack.manifest.id,
          }),
        });
      }
    }
    for (const id of selectedPatterns) {
      const p = pack.manifest.patterns.find((x) => x.id === id);
      if (p) {
        await fetch("/api/notebook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "pattern",
            front: p.pattern,
            back: `${p.zh}\n${p.grammar}`,
            language: pack.manifest.sourceLang,
            materialId: pack.manifest.id,
          }),
        });
      }
    }
    setSelectedVocab(new Set());
    setSelectedPatterns(new Set());
    alert("已加入 Notebook");
  }

  async function saveTranscript() {
    setSavingTranscript(true);
    await fetch(`/api/materials/${materialId}/transcript`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcriptText: transcriptDraft }),
    });
    await loadPack(materialId);
    setSavingTranscript(false);
    setTranscriptDraft("");
  }

  useEffect(() => {
    if (!pack) return;
    const seg = pack.segments[mode]?.[0];
    if (seg) {
      setSegmentStart(seg.start);
      setSegmentEnd(seg.end);
    }
  }, [mode, pack]);

  if (!pack) {
    return <div className="py-12 text-center text-muted-foreground">加载中...</div>;
  }

  const hasPlayableMedia =
    media?.type === "direct" || media?.type === "embed";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{pack.manifest.title}</h1>
        <p className="text-muted-foreground">
          {pack.manifest.sourceLang.toUpperCase()} · {pack.manifest.level}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <TabsList>
            <TabsTrigger value="extensive">泛听</TabsTrigger>
            <TabsTrigger value="intensive">精听</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Label className="text-xs">开始(秒)</Label>
          <Input
            type="number"
            className="w-20"
            value={segmentStart}
            onChange={(e) => setSegmentStart(Number(e.target.value))}
          />
          <Label className="text-xs">结束(秒)</Label>
          <Input
            type="number"
            className="w-20"
            value={segmentEnd}
            onChange={(e) => setSegmentEnd(Number(e.target.value))}
          />
          <span className="text-xs text-muted-foreground">
            ≈ {formatDuration(segmentStart)} - {formatDuration(segmentEnd)}
          </span>
        </div>
        <Button
          size="sm"
          variant={showSubtitles ? "default" : "outline"}
          onClick={() => setShowSubtitles(!showSubtitles)}
        >
          {showSubtitles ? "字幕开" : "字幕关"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {media?.type === "direct" && media.url ? (
            <video
              ref={videoRef}
              src={media.url}
              controls
              className="aspect-video w-full rounded-lg bg-black"
            />
          ) : media?.type === "embed" && media.embedSrc ? (
            <iframe
              src={media.embedSrc}
              className="aspect-video w-full rounded-lg border-0"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">媒体未加载</CardTitle>
                <CardDescription>
                  可导入资源、粘贴字幕或从网盘关联视频文件
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link href={`/resources?materialId=${materialId}`}>
                      导入学习资源
                    </Link>
                  </Button>
                  {pack.storage.url && (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={pack.storage.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        打开原始链接
                      </a>
                    </Button>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link href="/settings">连接网盘</Link>
                  </Button>
                </div>
                <div>
                  <Label className="text-xs">粘贴字幕（每行：目标语 | 中文）</Label>
                  <Textarea
                    rows={4}
                    value={transcriptDraft}
                    onChange={(e) => setTranscriptDraft(e.target.value)}
                    placeholder="社会工学とは... | 社会工程学是..."
                  />
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={!transcriptDraft || savingTranscript}
                    onClick={saveTranscript}
                  >
                    {savingTranscript ? "保存中..." : "保存字幕并提取词汇句型"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!hasPlayableMedia && pack.transcript.lines.length > 0 && (
            <p className="text-sm text-muted-foreground">
              已有字幕文本，可先学习对照内容；补充视频后可同步播放。
            </p>
          )}
        </div>

        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">字幕对照</CardTitle>
            <CardDescription>点击跳转 · ⭐ 标记优先跟读</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[480px] flex-1 space-y-2 overflow-y-auto">
            {linesInSegment.map((line, i) => (
              <div
                key={line.id}
                className={`flex items-start gap-2 rounded p-2 ${
                  i === currentLine ? "bg-primary/10" : "hover:bg-muted"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleMark("lines", line.id)}
                  className={
                    marks.lines.includes(line.id)
                      ? "text-yellow-500"
                      : "text-muted-foreground"
                  }
                >
                  <Star
                    className="h-4 w-4"
                    fill={marks.lines.includes(line.id) ? "currentColor" : "none"}
                  />
                </button>
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => {
                    setCurrentLine(i);
                    if (videoRef.current)
                      videoRef.current.currentTime = line.start;
                  }}
                >
                  <p className="font-medium">{line.text}</p>
                  {showSubtitles && (
                    <p className="text-sm text-muted-foreground">
                      {line.translation}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                词汇表 ({pack.manifest.vocabulary.length})
              </CardTitle>
              <Button
                size="sm"
                onClick={addToNotebook}
                disabled={selectedVocab.size + selectedPatterns.size === 0}
              >
                加入 Notebook
              </Button>
            </div>
          </CardHeader>
          <CardContent className="max-h-72 space-y-1 overflow-y-auto">
            {pack.manifest.vocabulary.map((v: VocabularyItem) => (
              <label
                key={v.id}
                className="flex cursor-pointer items-start gap-2 rounded p-1 hover:bg-muted"
              >
                <Checkbox
                  checked={selectedVocab.has(v.id)}
                  onCheckedChange={() => {
                    setSelectedVocab((prev) => {
                      const next = new Set(prev);
                      if (next.has(v.id)) next.delete(v.id);
                      else next.add(v.id);
                      return next;
                    });
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleMark("vocabulary", v.id);
                  }}
                  className={
                    marks.vocabulary.includes(v.id)
                      ? "text-yellow-500"
                      : "text-muted-foreground"
                  }
                >
                  <Star
                    className="h-3 w-3"
                    fill={
                      marks.vocabulary.includes(v.id) ? "currentColor" : "none"
                    }
                  />
                </button>
                <div>
                  <span className="font-medium">{v.word}</span>
                  <p className="text-sm text-muted-foreground">{v.zh}</p>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              句型 / 语法 ({pack.manifest.patterns.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-72 space-y-1 overflow-y-auto">
            {pack.manifest.patterns.map((p: PatternItem) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-start gap-2 rounded p-1 hover:bg-muted"
              >
                <Checkbox
                  checked={selectedPatterns.has(p.id)}
                  onCheckedChange={() => {
                    setSelectedPatterns((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      return next;
                    });
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleMark("patterns", p.id);
                  }}
                  className={
                    marks.patterns.includes(p.id)
                      ? "text-yellow-500"
                      : "text-muted-foreground"
                  }
                >
                  <Star
                    className="h-3 w-3"
                    fill={
                      marks.patterns.includes(p.id) ? "currentColor" : "none"
                    }
                  />
                </button>
                <div>
                  <p className="text-sm">{p.pattern}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.zh} — {p.grammar}
                  </p>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>
      </div>

      <Progress
        value={(currentLine / Math.max(linesInSegment.length, 1)) * 100}
      />
    </div>
  );
}
