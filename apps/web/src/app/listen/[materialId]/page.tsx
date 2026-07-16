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
import { hasDisplayableGrammar } from "@/lib/pattern-grammar";
import { hasSyntheticUniformTiming } from "@/lib/transcript-timing";
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
import { DraggableSubtitleOverlay } from "@/components/listen/draggable-subtitle-overlay";
import { SelectableSubtitleText } from "@/components/listen/selectable-subtitle-text";
import type { ParsedWordState } from "@/components/listen/selectable-subtitle-text";
import { guessLemmaKey } from "@/lib/lemma-keys";
import type { VocabIndexHit } from "@/lib/vocab-index";
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
  const [pendingWords, setPendingWords] = useState<Set<string>>(new Set());
  const [pendingLineIds, setPendingLineIds] = useState<Set<string>>(new Set());
  const [selectionParsing, setSelectionParsing] = useState(false);
  const [vocabIndexHits, setVocabIndexHits] = useState<VocabIndexHit[]>([]);
  const [media, setMedia] = useState<ResolvedMedia | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseMessage, setParseMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [videoTime, setVideoTime] = useState(0);
  const [subtitleOffsetSec, setSubtitleOffsetSec] = useState(0);
  const [realigning, setRealigning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const subtitleListRef = useRef<HTMLDivElement>(null);
  const activeSubtitleRef = useRef<HTMLDivElement>(null);
  const autoRealignDoneRef = useRef(false);

  async function loadPack(id: string) {
    const materialId = normalizeMaterialId(id);
    setLoadError("");

    // 后台拉取 GitHub，不阻塞页面加载
    const syncController = new AbortController();
    const syncTimer = setTimeout(() => syncController.abort(), 8_000);
    void fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pull", materialId }),
      signal: syncController.signal,
    })
      .catch(() => {})
      .finally(() => clearTimeout(syncTimer));

    const packRes = await fetch(
      `/api/materials/${encodeURIComponent(materialId)}`
    ).then((r) => r.json());

    if (packRes?.error || !packRes?.manifest) {
      setPack(null);
      setLoadError(
        packRes?.error === "Material not found"
          ? "素材不存在或数据文件损坏，请返回列表重新导入/同步。"
          : packRes?.error || "无法加载素材"
      );
      return;
    }

    const marksRes = await fetch(
      `/api/marks/${encodeURIComponent(materialId)}`
    ).then((r) => r.json());
    const vocabIndexRes = await fetch("/api/vocabulary-index").then((r) =>
      r.json()
    );
    setVocabIndexHits(vocabIndexRes.hits ?? []);

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

    // 有字幕即可听辨；词汇/句型改为点选按需解析，不再自动全量 LLM
    if (isPackContentReady(packRes)) {
      const lines = packRes.transcript?.lines ?? [];
      if (
        hasSyntheticUniformTiming(lines) &&
        !autoRealignDoneRef.current
      ) {
        autoRealignDoneRef.current = true;
        setParseMessage("检测到等间隔假时间轴，正在自动按语速对齐字幕…");
        setRealigning(true);
        try {
          const res = await fetch(
            `/api/materials/${encodeURIComponent(materialId)}/realign-subtitles`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mode: "speech-rate" }),
            }
          );
          const data = await res.json();
          setParseMessage(data.message || (data.ok ? "字幕已自动对齐" : "自动对齐失败"));
          if (data.ok) {
            const refreshed = await fetch(
              `/api/materials/${encodeURIComponent(materialId)}`
            ).then((r) => r.json());
            if (refreshed?.manifest) setPack(refreshed);
          }
        } catch {
          setParseMessage("自动对齐请求失败，可手动点「按语速对齐」");
        } finally {
          setRealigning(false);
        }
      } else {
        setParseMessage("字幕已就绪。点选单词/句子后再解析，可写入词汇表与句型。");
      }
      return;
    }

    if (packRes.manifest?.parseStatus === "processing") {
      const hasLines = (packRes.transcript?.lines?.length ?? 0) > 0;
      if (hasLines) {
        setParsing(false);
        setParseMessage("后台获取字幕中，可先浏览已有内容");
      } else {
        setParsing(true);
        setParseMessage("正在获取字幕…");
      }
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
      if (packRes?.error || !packRes?.manifest) return;
      setPack(packRes);
      const hasLines = (packRes.transcript?.lines?.length ?? 0) > 0;
      if (isPackContentReady(packRes)) {
        setParsing(false);
        setParseMessage("解析完成");
        clearInterval(timer);
      } else if (packRes.manifest?.parseStatus !== "processing") {
        setParsing(false);
        clearInterval(timer);
      } else if (hasLines) {
        setParsing(false);
        setParseMessage("后台解析进行中，可先浏览已有字幕与句型");
      }
    }, 5000);

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
        ? "正在确认字幕（不批量解析词汇/句型）…"
        : "正在获取字幕（优先已上传/粘贴的 SRT）…"
    );
    try {
      const res = await fetch(`/api/materials/${id}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force, subtitlesOnly: true }),
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
        if (hasSyntheticUniformTiming(packRes.transcript?.lines ?? [])) {
          setParseMessage("字幕已获取；正在自动对齐时间轴…");
          await realignSubtitles("speech-rate");
        } else {
          setParseMessage(
            data.message ||
              "字幕就绪。请点选单词或句子后，再解析到词汇表 / 句型。"
          );
        }
      } else if (data.parseStatus !== "processing") {
        setParsing(false);
        if (!data.message) {
          setParseMessage(
            "未能获取字幕。请上传与视频原声一致的 SRT，或在解析对话框勾选「允许自动获取字幕」。"
          );
        }
      }
    } catch {
      setParsing(false);
      setParseMessage("解析请求失败，请稍后重试");
    }
  }

  async function parsePendingVocabulary() {
    if (!pack || pendingWords.size === 0) return;
    setSelectionParsing(true);
    setParseMessage(`正在解析 ${pendingWords.size} 个选中词…`);
    try {
      const res = await fetch(
        `/api/materials/${encodeURIComponent(pack.manifest.id)}/parse-selection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "vocabulary",
            words: [...pendingWords],
            lineIds: [...pendingLineIds],
          }),
        }
      );
      const data = await res.json();
      setParseMessage(data.message || (data.ok ? "词汇解析完成" : "词汇解析失败"));
      if (data.ok) {
        setPendingWords(new Set());
        const [packRes, vocabIndexRes] = await Promise.all([
          fetch(`/api/materials/${encodeURIComponent(pack.manifest.id)}`).then(
            (r) => r.json()
          ),
          fetch("/api/vocabulary-index").then((r) => r.json()),
        ]);
        setPack(packRes);
        setVocabIndexHits(vocabIndexRes.hits ?? []);
      }
    } catch {
      setParseMessage("词汇解析请求失败");
    } finally {
      setSelectionParsing(false);
    }
  }

  async function reparseVocabulary() {
    if (!pack || selectedVocab.size === 0) {
      setParseMessage("请先在词汇表中勾选要重新解析的词");
      return;
    }
    setSelectionParsing(true);
    setParseMessage(`正在重新解析 ${selectedVocab.size} 个词…`);
    try {
      const res = await fetch(
        `/api/materials/${encodeURIComponent(pack.manifest.id)}/parse-selection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "vocabulary",
            vocabIds: [...selectedVocab],
            reparse: true,
          }),
        }
      );
      const data = await res.json();
      setParseMessage(data.message || (data.ok ? "重新解析完成" : "重新解析失败"));
      if (data.ok) {
        const [packRes, vocabIndexRes] = await Promise.all([
          fetch(`/api/materials/${encodeURIComponent(pack.manifest.id)}`).then(
            (r) => r.json()
          ),
          fetch("/api/vocabulary-index").then((r) => r.json()),
        ]);
        setPack(packRes);
        setVocabIndexHits(vocabIndexRes.hits ?? []);
        setSelectedVocab(new Set());
      }
    } catch {
      setParseMessage("词汇重新解析请求失败");
    } finally {
      setSelectionParsing(false);
    }
  }

  async function parsePendingPatterns() {
    if (!pack || pendingLineIds.size === 0) return;
    setSelectionParsing(true);
    setParseMessage(`正在合并解析 ${pendingLineIds.size} 行字幕为句型…`);
    try {
      const res = await fetch(
        `/api/materials/${encodeURIComponent(pack.manifest.id)}/parse-selection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "patterns",
            lineIds: [...pendingLineIds],
            merge: true,
          }),
        }
      );
      const data = await res.json();
      setParseMessage(data.message || (data.ok ? "句型解析完成" : "句型解析失败"));
      if (data.ok) {
        setPendingLineIds(new Set());
        const packRes = await fetch(
          `/api/materials/${encodeURIComponent(pack.manifest.id)}`
        ).then((r) => r.json());
        setPack(packRes);
      }
    } catch {
      setParseMessage("句型解析请求失败");
    } finally {
      setSelectionParsing(false);
    }
  }

  async function reparsePatterns() {
    if (!pack) return;
    const patternIds = [...selectedPatterns];
    const lineIds = [...pendingLineIds];
    if (!patternIds.length && !lineIds.length) {
      setParseMessage("请勾选「句型 / 语法」中的条目，或选中字幕行后再重新解析");
      return;
    }
    setSelectionParsing(true);
    setParseMessage(
      patternIds.length
        ? `正在重新解析 ${patternIds.length} 条句型…`
        : `正在重新解析 ${lineIds.length} 行字幕句型…`
    );
    try {
      const res = await fetch(
        `/api/materials/${encodeURIComponent(pack.manifest.id)}/parse-selection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "patterns",
            patternIds: patternIds.length ? patternIds : undefined,
            lineIds: lineIds.length ? lineIds : undefined,
            merge: lineIds.length > 1,
            reparse: true,
          }),
        }
      );
      const data = await res.json();
      setParseMessage(data.message || (data.ok ? "重新解析完成" : "重新解析失败"));
      if (data.ok) {
        const packRes = await fetch(
          `/api/materials/${encodeURIComponent(pack.manifest.id)}`
        ).then((r) => r.json());
        setPack(packRes);
        setSelectedPatterns(new Set());
      }
    } catch {
      setParseMessage("重新解析请求失败");
    } finally {
      setSelectionParsing(false);
    }
  }

  function selectPendingWord(word: string) {
    if (!pack) return;
    const lang = pack.manifest.sourceLang;
    const key = guessLemmaKey(word, lang);
    if (parsedWordStates.has(key)) return;
    setPendingWords((prev) => {
      const next = new Set(prev);
      const exists = [...next].some((w) => guessLemmaKey(w, lang) === key);
      if (!exists) next.add(word);
      return next;
    });
  }

  function deselectPendingWord(word: string) {
    if (!pack) return;
    const lang = pack.manifest.sourceLang;
    const key = guessLemmaKey(word, lang);
    setPendingWords((prev) => {
      const next = new Set(prev);
      for (const w of next) {
        if (guessLemmaKey(w, lang) === key) next.delete(w);
      }
      return next;
    });
  }

  function selectAllVocabulary() {
    if (!pack) return;
    setSelectedVocab(new Set(pack.manifest.vocabulary.map((v) => v.id)));
  }

  function selectAllPatterns() {
    if (!pack) return;
    setSelectedPatterns(new Set(pack.manifest.patterns.map((p) => p.id)));
  }

  function togglePendingLine(lineId: string) {
    setPendingLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
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

  const parsedWordStates = useMemo(() => {
    const map = new Map<string, ParsedWordState>();
    if (!pack) return map;
    const lang = pack.manifest.sourceLang;
    for (const v of pack.manifest.vocabulary) {
      const head = (v.lemma?.trim() || v.word).trim();
      if (!head) continue;
      map.set(guessLemmaKey(head, lang), { kind: "local" });
      if (v.word.trim() && v.word !== head) {
        map.set(guessLemmaKey(v.word, lang), { kind: "local" });
      }
    }
    for (const hit of vocabIndexHits) {
      if (hit.materialId === pack.manifest.id) continue;
      if (!map.has(hit.key)) {
        map.set(hit.key, {
          kind: "global",
          materialTitle: hit.materialTitle,
        });
      }
    }
    return map;
  }, [pack, vocabIndexHits]);

  const activeLine = useMemo(() => {
    if (!pack) return null;
    const t = videoTime - subtitleOffsetSec;
    return (
      linesInSegment.find((l) => t >= l.start && t < l.end) ??
      linesInSegment[currentLine] ??
      null
    );
  }, [pack, linesInSegment, currentLine, videoTime, subtitleOffsetSec]);

  async function realignSubtitles(
    mode: "speech-rate" | "offset" | "refetch",
    extra?: { offsetSec?: number }
  ) {
    if (!materialId) return;
    setRealigning(true);
    setParseMessage(
      mode === "speech-rate"
        ? "正在按语速重排字幕时间轴…"
        : mode === "offset"
          ? "正在平移字幕时间轴…"
          : "正在从链接拉取带时间轴字幕…"
    );
    try {
      const res = await fetch(
        `/api/materials/${encodeURIComponent(materialId)}/realign-subtitles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, ...extra }),
        }
      );
      const data = await res.json();
      setParseMessage(data.message || (data.ok ? "对齐完成" : "对齐失败"));
      if (data.ok) {
        setSubtitleOffsetSec(0);
        await loadPack(materialId);
      }
    } catch {
      setParseMessage("字幕对齐请求失败");
    } finally {
      setRealigning(false);
    }
  }

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
    const lines = pack.transcript.lines ?? [];
    const fullEnd =
      lines.length > 0
        ? lines[lines.length - 1].end
        : pack.segments[mode]?.[0]?.end ?? 300;
    const seg = pack.segments[mode]?.[0];
    // 字幕跟随覆盖全片；勿被「泛听建议 3 分钟」截断
    if (mode === "extensive") {
      setSegmentStart(0);
      setSegmentEnd(Math.max(fullEnd, 60));
      return;
    }
    if (seg) {
      setSegmentStart(seg.start);
      setSegmentEnd(Math.max(seg.end, fullEnd));
    } else {
      setSegmentStart(0);
      setSegmentEnd(Math.max(fullEnd, 60));
    }
  }, [mode, pack]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !pack?.transcript.lines.length) return;

    function onTimeUpdate() {
      const t = video!.currentTime;
      setVideoTime(t);
      const adj = t - subtitleOffsetSec;
      const idx = linesInSegment.findIndex((l) => adj >= l.start && adj < l.end);
      if (idx >= 0) setCurrentLine(idx);
    }

    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [pack, linesInSegment, subtitleOffsetSec]);

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

  if (loadError) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-muted-foreground">{loadError}</p>
        <Button asChild variant="outline">
          <Link href="/listen">返回听辨列表</Link>
        </Button>
      </div>
    );
  }

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
        {hasTranscript && (
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs">字幕偏移(秒)</Label>
            <Input
              type="number"
              step={0.5}
              className="w-20"
              value={subtitleOffsetSec}
              onChange={(e) => setSubtitleOffsetSec(Number(e.target.value))}
              title="正数：字幕整体延后；负数：整体提前"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={realigning}
              onClick={() => void realignSubtitles("speech-rate")}
              title="修复粘贴字幕的假等间隔时间轴，按语速对齐到视频时长"
            >
              {realigning ? "对齐中…" : "按语速对齐"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={realigning || subtitleOffsetSec === 0}
              onClick={() =>
                void realignSubtitles("offset", {
                  offsetSec: subtitleOffsetSec,
                })
              }
            >
              保存偏移
            </Button>
          </div>
        )}
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
                <DraggableSubtitleOverlay
                  text={activeLine.text}
                  materialId={materialId}
                >
                  <SelectableSubtitleText
                    text={activeLine.text}
                    lang={pack.manifest.sourceLang}
                    selectedWords={pendingWords}
                    parsedStates={parsedWordStates}
                    onSelectWord={selectPendingWord}
                    onDeselectWord={deselectPendingWord}
                    className="text-white"
                  />
                </DraggableSubtitleOverlay>
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
                ? "点选单词→解析到词汇表（字典型）；已解析词为绿色不可选，连点两下取消待选。勾选句子→解析句型"
                : "解析或粘贴字幕后显示跟随字幕"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {hasTranscript && (
              <div className="flex flex-wrap items-center gap-2 border-b pb-2">
                <Button
                  size="sm"
                  disabled={selectionParsing || pendingWords.size === 0}
                  onClick={() => void parsePendingVocabulary()}
                >
                  解析选中词 ({pendingWords.size})
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={selectionParsing || pendingLineIds.size === 0}
                  onClick={() => void parsePendingPatterns()}
                >
                  合并解析选中句 ({pendingLineIds.size})
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={
                    selectionParsing ||
                    (selectedPatterns.size === 0 && pendingLineIds.size === 0)
                  }
                  onClick={() => void reparsePatterns()}
                >
                  重新解析
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={
                    pendingWords.size === 0 && pendingLineIds.size === 0
                  }
                  onClick={() => {
                    setPendingWords(new Set());
                    setPendingLineIds(new Set());
                  }}
                >
                  清空选择
                </Button>
              </div>
            )}
          <div
            ref={subtitleListRef}
            className="max-h-[480px] flex-1 space-y-2 overflow-y-auto scroll-smooth"
          >
            {!hasTranscript && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {parsing ? "正在获取字幕…" : "暂无字幕内容"}
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
                <Checkbox
                  checked={pendingLineIds.has(line.id)}
                  onCheckedChange={() => togglePendingLine(line.id)}
                  title="选中此句以解析句型"
                />
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
                      videoRef.current.currentTime =
                        line.start + subtitleOffsetSec;
                  }}
                >
                  <SelectableSubtitleText
                    text={line.text}
                    lang={pack.manifest.sourceLang}
                    selectedWords={pendingWords}
                    parsedStates={parsedWordStates}
                    onSelectWord={selectPendingWord}
                    onDeselectWord={deselectPendingWord}
                  />
                </div>
                </div>
              ))}
            {!showSubtitles && hasTranscript && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                字幕已关闭
              </p>
            )}
          </div>
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
                  variant="outline"
                  disabled={
                    selectionParsing || pack.manifest.vocabulary.length === 0
                  }
                  onClick={selectAllVocabulary}
                >
                  全选
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={selectionParsing || selectedVocab.size === 0}
                  onClick={() => void reparseVocabulary()}
                >
                  重新解析 ({selectedVocab.size})
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
            <CardDescription>
              点选单词并解析后以字典型（原形）展示；绿色为已解析不可选
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[28rem] space-y-1 overflow-y-auto">
            {pack.manifest.vocabulary.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                暂无词汇。请在字幕对照中点选单词后解析。
              </p>
            )}
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
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-medium">{v.word}</span>
                    {v.reading && (
                      <span className="text-xs text-muted-foreground">
                        〔{v.reading}〕
                      </span>
                    )}
                    {v.lemma && v.lemma.toLowerCase() !== v.word.toLowerCase() && (
                      <span className="text-xs text-muted-foreground">
                        原型 {v.lemma}
                      </span>
                    )}
                    {v.isAcronym && (
                      <span className="rounded bg-amber-500/15 px-1 text-[10px] text-amber-800 dark:text-amber-200">
                        缩写
                      </span>
                    )}
                    {v.isLoanword && (
                      <span className="rounded bg-sky-500/15 px-1 text-[10px] text-sky-800 dark:text-sky-200">
                        外来语
                      </span>
                    )}
                  </div>
                  {v.zh && v.zh !== v.word && (
                    <p className="text-sm text-muted-foreground">
                      中文：{v.zh}
                    </p>
                  )}
                  {v.glossEn && (
                    <p className="text-sm text-muted-foreground">
                      EN：{v.glossEn}
                    </p>
                  )}
                  {v.glossJa && (
                    <p className="text-sm text-muted-foreground">
                      日文：{v.glossJa}
                    </p>
                  )}
                  {v.etymology && (
                    <p className="text-xs text-muted-foreground">
                      来源：{v.etymology}
                    </p>
                  )}
                  {v.notes && (
                    <p className="text-xs text-muted-foreground">{v.notes}</p>
                  )}
                  {v.dictUrl && (
                    <a
                      href={v.dictUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      词典 / 词形变化
                    </a>
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
            <CardDescription>
              在上方勾选字幕并解析；固定搭配会写入讲解。说/读/写练习取用此处内容
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[28rem] space-y-2 overflow-y-auto">
            {pack.manifest.patterns.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b pb-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectionParsing}
                  onClick={selectAllPatterns}
                >
                  全选
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={selectionParsing || selectedPatterns.size === 0}
                  onClick={() => void reparsePatterns()}
                >
                  重新解析 ({selectedPatterns.size || pendingLineIds.size})
                </Button>
              </div>
            )}
            {pack.manifest.patterns.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                暂无句型。请勾选字幕句后解析。
              </p>
            )}
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
                <div className="min-w-0">
                  <p className="text-sm">{p.pattern}</p>
                  {p.zh && (
                    <p className="text-xs text-muted-foreground">中文：{p.zh}</p>
                  )}
                  {hasDisplayableGrammar(p.grammar) && (
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {parseRules.patternLabel}：{p.grammar}
                    </p>
                  )}
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
