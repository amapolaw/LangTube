"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import type {
  ContentPack,
  MaterialMarks,
  MaterialIndexEntry,
  ResolvedMedia,
  VocabularyItem,
  PatternItem,
} from "@langtube/core";
import { formatDuration } from "@langtube/core";
import { resolveMediaClient } from "@/lib/media-resolver";
import { MaterialResourceUpload } from "@/components/material-resource-upload";
import { sourceLangFromMaterial } from "@/lib/material-form";
import {
  mediaUrlForMaterial,
  normalizeMaterialId,
} from "@/lib/material-id";
import {
  isPackContentReady,
  isPackFullyEnriched,
} from "@/lib/pack-readiness";
import { getParseRules } from "@/lib/parse-rules";
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
  const [parsing, setParsing] = useState(false);
  const [parseMessage, setParseMessage] = useState("");
  const [videoTime, setVideoTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const subtitleListRef = useRef<HTMLDivElement>(null);
  const activeSubtitleRef = useRef<HTMLDivElement>(null);

  async function loadPack(id: string) {
    const materialId = normalizeMaterialId(id);
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pull", materialId }),
    }).catch(() => {});

    const [packRes, marksRes] = await Promise.all([
      fetch(`/api/materials/${encodeURIComponent(materialId)}`).then((r) =>
        r.json()
      ),
      fetch(`/api/marks/${encodeURIComponent(materialId)}`).then((r) =>
        r.json()
      ),
    ]);
    setPack(packRes);
    setMarks(marksRes);
    const remoteUrl =
      packRes.storage?.url || packRes.manifest?.sourceUrl || "";
    const localUrl = mediaUrlForMaterial(materialId);
    const resolved = resolveMediaClient(
      packRes.storage,
      packRes.manifest?.sourceUrl,
      materialId
    );

    // 有本地文件：materialId 直链（规范化后只编码一次）
    if (packRes.storage?.path) {
      const head = await fetch(localUrl, { method: "HEAD" }).catch(() => null);
      if (head?.ok) {
        setMedia({
          type: "direct",
          url: localUrl,
          sourceUrl: remoteUrl || undefined,
        });
        setParseMessage(
          "本地视频加载中（MOV/HEVC 首次会自动转码为可播 MP4，请稍候）"
        );
      } else if (remoteUrl.includes("bilibili.com")) {
        try {
          const fallback = await fetch(
            `/api/media/resolve?url=${encodeURIComponent(remoteUrl)}`
          ).then((r) => r.json());
          setMedia(
            fallback?.type === "direct"
              ? fallback
              : { type: "direct", url: localUrl, sourceUrl: remoteUrl }
          );
        } catch {
          setMedia({ type: "direct", url: localUrl, sourceUrl: remoteUrl });
        }
      } else {
        setMedia({
          type: "direct",
          url: localUrl,
          sourceUrl: remoteUrl || undefined,
        });
      }
    } else if (
      remoteUrl.includes("bilibili.com") ||
      resolved.type === "external"
    ) {
      try {
        const fallback = await fetch(
          `/api/media/resolve?url=${encodeURIComponent(remoteUrl)}`
        ).then((r) => r.json());
        if (fallback?.type === "direct" && fallback.url) {
          setMedia(fallback);
        } else {
          setMedia(resolved);
        }
      } catch {
        setMedia(resolved);
      }
    } else {
      setMedia(resolved);
    }

    // 默认展示全片字幕区间（勿只用 extensive 前 3 分钟）
    const lines = packRes.transcript?.lines ?? [];
    const fullEnd =
      lines.length > 0
        ? lines[lines.length - 1].end
        : packRes.segments?.intensive?.[0]?.end ??
          packRes.segments?.extensive?.[0]?.end ??
          3600;
    setSegmentStart(0);
    setSegmentEnd(Math.max(fullEnd, 60));

    if (isPackContentReady(packRes)) {
      const translated = (packRes.transcript?.lines ?? []).filter(
        (l: { translation?: string }) => l.translation?.trim()
      ).length;
      const total = packRes.transcript?.lines?.length ?? 0;
      const needsCursor =
        packRes.manifest?.enrichmentMode === "rules" &&
        total > 0 &&
        translated < total * 0.3;
      if (!needsCursor) return;
      setParsing(true);
      setParseMessage("正在用 Cursor 全量生成双语字幕、词汇与句型…");
      await autoParseSubtitles(materialId, packRes, true);
      return;
    }

    if (packRes.manifest?.parseStatus === "processing") {
      setParsing(true);
      setParseMessage("正在解析字幕与词汇…");
    } else {
      await autoParseSubtitles(materialId, packRes);
    }
  }

  useEffect(() => {
    params.then((p) => {
      const id = normalizeMaterialId(p.materialId);
      setMaterialId(id);
      loadPack(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only initial load
  }, [params]);

  useEffect(() => {
    if (!materialId || !parsing) return;
    if (pack && isPackContentReady(pack)) {
      setParsing(false);
      setParseMessage("解析完成");
      return;
    }

    const timer = setInterval(async () => {
      const packRes = await fetch(`/api/materials/${materialId}`).then((r) =>
        r.json()
      );
      setPack(packRes);
      if (isPackContentReady(packRes)) {
        setParsing(false);
        setParseMessage("解析完成");
        clearInterval(timer);
      } else if (packRes.manifest?.parseStatus !== "processing") {
        setParsing(false);
        clearInterval(timer);
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [materialId, parsing, pack]);

  async function autoParseSubtitles(
    id: string,
    initialPack?: ContentPack,
    force = false
  ) {
    setParsing(true);
    const hasLines = (initialPack?.transcript?.lines?.length ?? 0) > 0;
    setParseMessage(
      hasLines
        ? "正在 LLM 生成翻译、词汇表与句型语法…"
        : "正在获取字幕 → LLM 分析…"
    );
    try {
      const res = await fetch(`/api/materials/${id}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      setParseMessage(data.message ?? "");
      const [packRes, marksRes] = await Promise.all([
        fetch(`/api/materials/${id}`).then((r) => r.json()),
        fetch(`/api/marks/${id}`).then((r) => r.json()),
      ]);
      setPack(packRes);
      setMarks(marksRes);
      if (isPackContentReady(packRes)) {
        setParsing(false);
        setParseMessage("解析完成");
      } else if (data.parseStatus !== "processing") {
        setParsing(false);
        if (!data.message) {
          setParseMessage(
            "解析未完成。B站视频需 Whisper 转写视频原声（语种与素材一致）；YouTube 等链接需 yt-dlp；本地文件需 ffmpeg + whisper。在 Cursor IDE 终端运行可使用已登录会话生成翻译。"
          );
        }
      }
    } catch {
      setParsing(false);
      setParseMessage("解析请求失败，请稍后重试");
    }
  }

  const linesInSegment = useMemo(() => {
    if (!pack) return [];
    return pack.transcript.lines.filter(
      (l) => l.start < segmentEnd && l.end > segmentStart
    );
  }, [pack, segmentStart, segmentEnd]);

  const parseRules = useMemo(
    () =>
      pack ? getParseRules(pack.manifest.sourceLang) : getParseRules("en"),
    [pack]
  );

  const activeLine = useMemo(() => {
    if (!pack) return null;
    return (
      linesInSegment.find((l) => videoTime >= l.start && videoTime < l.end) ??
      linesInSegment[currentLine] ??
      null
    );
  }, [pack, linesInSegment, currentLine, videoTime]);

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
        const exampleLines = (v.sentenceIds ?? [])
          .map((sid) => pack.transcript.lines.find((l) => l.id === sid))
          .filter(Boolean)
          .slice(0, 3)
          .map((l) =>
            l!.translation
              ? `${l!.text} / ${l!.translation}`
              : l!.text
          );

        await fetch("/api/notebook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "vocabulary",
            front: v.word,
            back: v.zh || "",
            reading: v.reading,
            partOfSpeech: v.partOfSpeech,
            explanation: v.partOfSpeech
              ? `词性：${v.partOfSpeech}`
              : undefined,
            examples: exampleLines,
            language: pack.manifest.sourceLang,
            materialId: pack.manifest.id,
            tags: pack.manifest.topics ?? [],
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
            back: p.zh || "",
            explanation: p.grammar,
            examples: p.examples ?? [],
            language: pack.manifest.sourceLang,
            materialId: pack.manifest.id,
            tags: pack.manifest.topics ?? [],
          }),
        });
      }
    }
    setSelectedVocab(new Set());
    setSelectedPatterns(new Set());
    alert("已加入 Notebook");
  }

  async function syncLevelToNotebook() {
    if (!pack) return;
    setParseMessage("正在按等级甄别并写入 Notebook…");
    try {
      const res = await fetch(
        `/api/materials/${pack.manifest.id}/level-sync`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "等级同步失败");
        return;
      }
      await loadPack(pack.manifest.id);
      alert(data.message || "已按等级写入 Notebook");
    } catch (err) {
      alert(err instanceof Error ? err.message : "等级同步失败");
    } finally {
      setParseMessage("");
    }
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !pack?.transcript.lines.length) return;

    function onTimeUpdate() {
      const t = video!.currentTime;
      setVideoTime(t);
      const idx = linesInSegment.findIndex((l) => t >= l.start && t < l.end);
      if (idx >= 0) setCurrentLine(idx);
    }

    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [pack, linesInSegment]);

  // 字幕对照跟随视频进度自动滚动到当前句
  useEffect(() => {
    const container = subtitleListRef.current;
    const active = activeSubtitleRef.current;
    if (!container || !active || !showSubtitles) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const offset =
      activeRect.top -
      containerRect.top -
      containerRect.height / 2 +
      activeRect.height / 2;

    container.scrollBy({ top: offset, behavior: "smooth" });
  }, [currentLine, showSubtitles]);

  if (!pack) {
    return <div className="py-12 text-center text-muted-foreground">加载中...</div>;
  }

  const hasPlayableMedia =
    media?.type === "direct" || media?.type === "embed";
  const hasTranscript = pack.transcript.lines.length > 0;
  const displayLang = sourceLangFromMaterial(
    pack.manifest.id,
    pack.manifest.sourceLang
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{pack.manifest.title}</h1>
        <p className="text-muted-foreground">
          {displayLang.toUpperCase()} · {pack.manifest.level}
          {parsing && " · 解析中"}
          {!parsing &&
            isPackFullyEnriched(pack) &&
            " · 已完整解析（双语+词汇+句型）"}
          {!parsing &&
            isPackContentReady(pack) &&
            !isPackFullyEnriched(pack) &&
            (pack.manifest.enrichmentMode === "rules"
              ? " · 已解析（规则模式）"
              : " · 已解析")}
          {!parsing && !isPackContentReady(pack) && " · 待完善"}
        </p>
        <div className="mt-3">
          <p className="mb-2 text-xs text-muted-foreground">资源上传 / 调整</p>
          <MaterialResourceUpload
            material={{
              id: pack.manifest.id,
              title: pack.manifest.title,
              sourceLang: displayLang as MaterialIndexEntry["sourceLang"],
              nativeLang: pack.manifest.nativeLang,
              level: pack.manifest.level,
              topics: pack.manifest.topics,
              storageLocation: pack.storage.provider,
              parseStatus: pack.manifest.parseStatus,
              createdAt: pack.manifest.createdAt,
              updatedAt: pack.manifest.updatedAt,
              sourceUrl: pack.manifest.sourceUrl,
            }}
            size="default"
            onUploaded={(msg) => setParseMessage(msg)}
          />
        </div>
      </div>

      {parsing && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-4 py-4">
            <Progress value={33} className="flex-1" />
            <p className="text-sm text-muted-foreground">
              {parseMessage ||
                "正在获取字幕 → 按语言/水平解析 → 同步 GitHub…"}
            </p>
          </CardContent>
        </Card>
      )}

      {!parsing &&
        isPackContentReady(pack) &&
        !isPackFullyEnriched(pack) && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-4">
              <p className="text-sm">
                已生成词汇表（原文+中文）与句型语法。完整双语字幕对照需 LLM
                增强：在 Cursor IDE 终端运行本应用，或粘贴双语字幕后点「重新解析」。
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => autoParseSubtitles(materialId, pack, true)}
              >
                重新解析（尝试 LLM）
              </Button>
            </CardContent>
          </Card>
        )}

      {!parsing && parseMessage && !isPackContentReady(pack) && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <p className="text-sm">{parseMessage}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => autoParseSubtitles(materialId, pack, true)}
              >
                重新解析
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/resources?materialId=${materialId}`}>
                  粘贴字幕 / 补充资源
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!parsing && !hasPlayableMedia && hasTranscript && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <p className="text-sm">
              视频链接未同步到本机。请从 GitHub 拉取最新数据，或在{" "}
              <Link
                href={`/resources?materialId=${materialId}`}
                className="text-primary underline"
              >
                资源页
              </Link>{" "}
              重新粘贴 B站/YouTube 链接。
            </p>
          </CardContent>
        </Card>
      )}

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
          disabled={!hasTranscript}
        >
          {showSubtitles ? "字幕开" : "字幕关"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {media?.type === "direct" && media.url ? (
            <div className="relative">
              <video
                ref={videoRef}
                src={media.url}
                controls
                className="aspect-video w-full rounded-lg bg-black"
              />
              {showSubtitles && activeLine && (
                <div className="pointer-events-none absolute inset-x-0 bottom-12 px-4 text-center">
                  <p className="inline-block rounded bg-black/75 px-3 py-1 text-sm text-white">
                    {activeLine.text}
                  </p>
                </div>
              )}
            </div>
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

          {hasPlayableMedia && !hasTranscript && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">暂无字幕</CardTitle>
                <CardDescription>
                  {parsing
                    ? parseMessage || "正在解析…"
                    : parseMessage ||
                      "视频无可用学习语种字幕。B站需 Whisper 转写视频原声（语种与素材一致）；也可粘贴字幕、上传 SRT。App 解析失败时可由 Cursor Agent 读取 data/agent-tasks 补全。"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={parsing}
                    onClick={() => autoParseSubtitles(materialId, undefined, true)}
                  >
                    {parsing ? "解析中…" : "重新尝试解析"}
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/resources?materialId=${materialId}`}>
                      上传 SRT / 补充资源
                    </Link>
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

        <Card className={`flex flex-col ${!showSubtitles ? "opacity-60" : ""}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">字幕对照</CardTitle>
            <CardDescription>
              {hasTranscript
                ? "仅展示视频语种跟随字幕 · 自动滚动 · 点击跳转"
                : "解析或粘贴字幕后显示跟随字幕"}
            </CardDescription>
          </CardHeader>
          <CardContent
            ref={subtitleListRef}
            className="max-h-[480px] flex-1 space-y-2 overflow-y-auto scroll-smooth"
          >
            {!hasTranscript && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {parsing ? "正在解析字幕…" : "暂无字幕内容"}
              </p>
            )}
            {showSubtitles &&
              linesInSegment.map((line, i) => (
              <div
                key={line.id}
                ref={i === currentLine ? activeSubtitleRef : undefined}
                className={`flex items-start gap-2 rounded p-2 transition-colors ${
                  i === currentLine
                    ? "bg-primary/15 ring-1 ring-primary/30"
                    : "hover:bg-muted"
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
                </div>
                </div>
              ))}
            {!showSubtitles && hasTranscript && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                字幕已关闭
              </p>
            )}
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
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={syncLevelToNotebook}
                  title="对照 Language 参考资料，按素材等级甄别并写入 Notebook"
                >
                  按等级写入 Notebook
                </Button>
                <Button
                  size="sm"
                  onClick={addToNotebook}
                  disabled={selectedVocab.size + selectedPatterns.size === 0}
                >
                  加入 Notebook
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="max-h-[28rem] space-y-1 overflow-y-auto">
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
                  {v.zh && v.zh !== v.word && (
                    <p className="text-sm text-muted-foreground">
                      {parseRules.vocabLabel}：{v.zh}
                    </p>
                  )}
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
          <CardContent className="max-h-[28rem] space-y-2 overflow-y-auto">
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
                    {parseRules.patternLabel}：{p.grammar}
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
