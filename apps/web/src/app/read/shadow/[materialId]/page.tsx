"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import type { ContentPack, TranscriptLine, MaterialMarks } from "@langtube/core";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Star } from "lucide-react";

export default function ShadowReadingPage({
  params,
}: {
  params: Promise<{ materialId: string }>;
}) {
  const [pack, setPack] = useState<ContentPack | null>(null);
  const [marks, setMarks] = useState<MaterialMarks>({
    lines: [],
    vocabulary: [],
    patterns: [],
    updatedAt: "",
  });
  const [lineIndex, setLineIndex] = useState(0);
  const [delayMode, setDelayMode] = useState(false);
  const [markedOnly, setMarkedOnly] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [userSpeech, setUserSpeech] = useState("");
  const [similarity, setSimilarity] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    params.then(async (p) => {
      const [packData, marksData] = await Promise.all([
        fetch(`/api/materials/${p.materialId}`).then((r) => r.json()),
        fetch(`/api/marks/${p.materialId}`).then((r) => r.json()),
      ]);
      setPack(packData);
      setMarks(marksData);
    });
  }, [params]);

  const queue = useMemo(() => {
    if (!pack) return [];
    const all = pack.transcript.lines;
    const marked = all.filter((l) => marks.lines.includes(l.id));
    const rest = all.filter((l) => !marks.lines.includes(l.id));
    if (markedOnly) return marked;
    return [...marked, ...rest];
  }, [pack, marks, markedOnly]);

  const currentLine: TranscriptLine | undefined = queue[lineIndex];

  const { start: startSpeech, stop: stopSpeech } = useSpeechRecognition({
    lang:
      pack?.manifest.sourceLang === "ja"
        ? "ja-JP"
        : pack?.manifest.sourceLang === "es"
          ? "es-ES"
          : pack?.manifest.sourceLang === "fr"
            ? "fr-FR"
            : "en-US",
    onResult: (text) => {
      setUserSpeech(text);
      setIsRecording(false);
      submitShadow(text);
    },
    onError: () => setIsRecording(false),
  });

  function playLine() {
    if (!currentLine) return;
    setIsPlaying(true);
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(currentLine.text);
      utterance.lang =
        pack?.manifest.sourceLang === "ja"
          ? "ja-JP"
          : pack?.manifest.sourceLang === "es"
            ? "es-ES"
            : pack?.manifest.sourceLang === "fr"
              ? "fr-FR"
              : "en-US";
      utterance.onend = () => {
        setIsPlaying(false);
        if (delayMode) setTimeout(() => startRecording(), 500);
        else startRecording();
      };
      speechSynthesis.speak(utterance);
    }
  }

  function startRecording() {
    setIsRecording(startSpeech());
  }

  async function submitShadow(speech: string) {
    if (!pack || !currentLine) return;
    const res = await fetch("/api/shadow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        materialId: pack.manifest.id,
        lineId: currentLine.id,
        transcript: currentLine.text,
        translation: currentLine.translation,
        userSpeech: speech,
      }),
    });
    const data = await res.json();
    setSimilarity(data.similarity);
  }

  function nextLine() {
    setLineIndex((i) => Math.min(i + 1, queue.length - 1));
    setUserSpeech("");
    setSimilarity(null);
  }

  if (!pack) {
    return <div className="py-12 text-center">加载中...</div>;
  }

  const markedCount = marks.lines.length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">影子跟读 — {pack.manifest.title}</h1>

      {markedCount > 0 && (
        <p className="text-sm text-primary">
          优先跟读 {markedCount} 句（来自听模块标记）
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={delayMode ? "default" : "outline"}
          onClick={() => setDelayMode(!delayMode)}
        >
          {delayMode ? "延迟跟读 (0.5s)" : "同步跟读"}
        </Button>
        <Button
          size="sm"
          variant={markedOnly ? "default" : "outline"}
          onClick={() => {
            setMarkedOnly(!markedOnly);
            setLineIndex(0);
          }}
        >
          {markedOnly ? "仅练标记句" : "全部句子"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>
            第 {lineIndex + 1} / {queue.length} 句
            {marks.lines.includes(currentLine?.id ?? "") && (
              <Star className="ml-1 inline h-4 w-4 fill-yellow-400 text-yellow-400" />
            )}
          </CardDescription>
          <CardTitle className="text-xl">{currentLine?.text}</CardTitle>
          <CardDescription>{currentLine?.translation}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={((lineIndex + 1) / Math.max(queue.length, 1)) * 100} />

          <div className="flex gap-2">
            <Button onClick={playLine} disabled={isPlaying || isRecording}>
              {isPlaying ? "播放中..." : "播放并跟读"}
            </Button>
            <Button variant="outline" onClick={nextLine}>
              下一句
            </Button>
          </div>

          {isRecording && (
            <p className="animate-pulse text-primary">正在录音...</p>
          )}

          {userSpeech && (
            <div className="rounded bg-muted p-3">
              <p className="text-sm text-muted-foreground">你的跟读</p>
              <p>{userSpeech}</p>
            </div>
          )}

          {similarity !== null && (
            <div
              className={`rounded p-3 text-center font-medium ${
                similarity >= 0.6
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              相似度：{(similarity * 100).toFixed(0)}%
              {similarity < 0.6 && " — 已标记为薄弱句"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
