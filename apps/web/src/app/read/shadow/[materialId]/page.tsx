"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import type {
  ContentPack,
  TranscriptLine,
  ResolvedMedia,
  VocabularyItem,
} from "@langtube/core";
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
import { resolveMediaClient } from "@/lib/media-resolver";
import { mediaUrlForMaterial } from "@/lib/material-id";
import { buildReadingMap } from "@/lib/japanese-ruby";
import { JapaneseRubyText } from "@/components/japanese-ruby-text";
import { resolvePatternAudioRange } from "@/lib/pattern-audio-range";
import Link from "next/link";

export default function ShadowReadingPage({
  params,
}: {
  params: Promise<{ materialId: string }>;
}) {
  const [materialId, setMaterialId] = useState("");
  const [pack, setPack] = useState<ContentPack | null>(null);
  const [media, setMedia] = useState<ResolvedMedia | null>(null);
  const [mediaStatus, setMediaStatus] = useState<
    "idle" | "resolving" | "downloading" | "ready" | "failed"
  >("idle");
  const [mediaMessage, setMediaMessage] = useState("");
  const [lineIndex, setLineIndex] = useState(0);
  const [delayMode, setDelayMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [userSpeech, setUserSpeech] = useState("");
  const [similarity, setSimilarity] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playError, setPlayError] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const stopHandlerRef = useRef<(() => void) | null>(null);

  const resolvePlayback = useCallback(async (packData: ContentPack) => {
    setMediaStatus("resolving");
    setMediaMessage("正在解析可播放直链…");

    const materialId = packData.manifest.id;
    const remoteUrl =
      packData.storage?.url || packData.manifest?.sourceUrl || "";

    if (packData.storage?.path) {
      const local: ResolvedMedia = {
        type: "direct",
        url: mediaUrlForMaterial(materialId),
        sourceUrl: remoteUrl || undefined,
      };
      setMedia(local);
      setMediaStatus("ready");
      setMediaMessage("");
      return local;
    }

    let resolved = resolveMediaClient(
      packData.storage,
      packData.manifest?.sourceUrl,
      materialId
    );

    if (resolved.type === "direct" && resolved.url) {
      setMedia(resolved);
      setMediaStatus("ready");
      setMediaMessage("");
      return resolved;
    }

    if (remoteUrl) {
      try {
        const fallback = await fetch(
          `/api/media/resolve?url=${encodeURIComponent(remoteUrl)}`
        ).then((r) => r.json());
        if (fallback?.type === "direct" && fallback.url) {
          setMedia(fallback);
          setMediaStatus("ready");
          setMediaMessage("已解析直链（经代理播放，可截取单句）");
          return fallback as ResolvedMedia;
        }
      } catch {
        /* continue to download */
      }
    }

    setMedia(resolved);
    setMediaStatus("failed");
    setMediaMessage(
      remoteUrl
        ? "直链解析未成功。可点击「下载到本地」后跟读。"
        : "没有远程链接或本地视频。请在资源页补充 B站链接或上传文件。"
    );
    return resolved;
  }, []);

  const ensureLocalMedia = useCallback(
    async (id: string, sourceUrl?: string) => {
      setMediaStatus("downloading");
      setMediaMessage("正在下载视频到本地（首次可能需 1–2 分钟）…");
      try {
        const res = await fetch(`/api/materials/${id}/ensure-media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sourceUrl ? { sourceUrl } : {}),
        });
        const data = await res.json();
        if (!res.ok) {
          setMediaStatus("failed");
          setMediaMessage(data.error || "下载失败");
          return;
        }
        const playback: ResolvedMedia = {
          type: "direct",
          url: data.playbackUrl,
          sourceUrl: data.sourceUrl,
        };
        setMedia(playback);
        setMediaStatus("ready");
        setMediaMessage("已下载到本地，可精确截取原声跟读");

        // 刷新 pack（storage.path 已更新）
        const packData = await fetch(`/api/materials/${id}`).then((r) =>
          r.json()
        );
        setPack(packData);
      } catch (err) {
        setMediaStatus("failed");
        setMediaMessage(
          err instanceof Error ? err.message : "下载失败"
        );
      }
    },
    []
  );

  useEffect(() => {
    params.then(async (p) => {
      setMaterialId(p.materialId);
      const packData = await fetch(`/api/materials/${p.materialId}`).then((r) =>
        r.json()
      );
      setPack(packData);
      await resolvePlayback(packData);
    });
  }, [params, resolvePlayback]);

  const readingMap = useMemo(
    () => buildReadingMap((pack?.manifest.vocabulary ?? []) as VocabularyItem[]),
    [pack]
  );

  const isJa = pack?.manifest.sourceLang === "ja";

  const queue = useMemo(() => {
    if (!pack) return [];
    const patterns = pack.manifest.patterns ?? [];
    // 影子跟读改为使用听辨「句型 / 语法」内容
    if (patterns.length === 0) return [];
    const lang = pack.manifest.sourceLang;
    const lines = pack.transcript.lines ?? [];
    return patterns.map((p) => {
      const range = resolvePatternAudioRange(p.pattern, lines, lang);
      return {
        id: p.id,
        start: range.start,
        end: range.end,
        text: p.pattern,
        translation: p.zh || "",
      } satisfies TranscriptLine;
    });
  }, [pack]);

  const currentLine: TranscriptLine | undefined = queue[lineIndex];
  const patternCount = pack?.manifest.patterns.length ?? 0;
  const hasDirectAudio = media?.type === "direct" && Boolean(media.url);
  const remoteUrl =
    pack?.storage?.url || pack?.manifest?.sourceUrl || "";

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

  const cleanupPlayback = useCallback(() => {
    if (stopHandlerRef.current) {
      stopHandlerRef.current();
      stopHandlerRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
    }
  }, []);

  useEffect(() => {
    return () => cleanupPlayback();
  }, [cleanupPlayback]);

  function startRecording() {
    setIsRecording(startSpeech());
  }

  function playOriginalAudio() {
    if (!currentLine) return;
    setPlayError("");
    cleanupPlayback();

    const video = videoRef.current;
    if (!hasDirectAudio || !video) {
      setPlayError(
        "当前素材没有可截取的视频原声。请先解析直链或下载到本地后再跟读。"
      );
      return;
    }

    setIsPlaying(true);
    const start = currentLine.start;
    const end = Math.max(currentLine.end, start + 0.3);

    const finish = () => {
      video.pause();
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      stopHandlerRef.current = null;
      setIsPlaying(false);
      if (delayMode) setTimeout(() => startRecording(), 500);
      else startRecording();
    };

    const onTimeUpdate = () => {
      if (video.currentTime >= end - 0.05) finish();
    };
    const onEnded = () => finish();

    stopHandlerRef.current = () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };

    const seekAndPlay = () => {
      video.currentTime = start;
      video
        .play()
        .then(() => {
          video.addEventListener("timeupdate", onTimeUpdate);
          video.addEventListener("ended", onEnded);
        })
        .catch(() => {
          setIsPlaying(false);
          setPlayError(
            "无法播放原声。若为 B站链接，请点「下载到本地」后再试。"
          );
        });
    };

    if (video.readyState >= 1) {
      seekAndPlay();
    } else {
      const onLoaded = () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        seekAndPlay();
      };
      video.addEventListener("loadedmetadata", onLoaded);
      video.load();
    }
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
    cleanupPlayback();
    setIsPlaying(false);
    setIsRecording(false);
    stopSpeech();
    setLineIndex((i) => Math.min(i + 1, queue.length - 1));
    setUserSpeech("");
    setSimilarity(null);
    setPlayError("");
  }

  if (!pack) {
    return <div className="py-12 text-center">加载中...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">影子跟读 — {pack.manifest.title}</h1>

      {patternCount > 0 ? (
        <p className="text-sm text-primary">
          跟读 {patternCount} 条句型（来自听辨「句型 / 语法」）
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          暂无句型。请先到听辨页勾选字幕并解析句型。{" "}
          <Link href={`/listen/${materialId}`} className="text-primary underline">
            去听辨
          </Link>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={delayMode ? "default" : "outline"}
          onClick={() => setDelayMode(!delayMode)}
        >
          {delayMode ? "延迟跟读 (0.5s)" : "同步跟读"}
        </Button>
        {remoteUrl && (
          <Button
            size="sm"
            variant="outline"
            disabled={mediaStatus === "downloading" || mediaStatus === "resolving"}
            onClick={() => ensureLocalMedia(materialId, remoteUrl)}
          >
            {mediaStatus === "downloading" ? "下载中…" : "下载到本地"}
          </Button>
        )}
      </div>

      {mediaMessage && (
        <p
          className={`text-sm ${
            mediaStatus === "failed"
              ? "text-destructive"
              : "text-muted-foreground"
          }`}
        >
          {mediaMessage}
        </p>
      )}

      {hasDirectAudio && (
        <div className="overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            src={media!.url}
            className="aspect-video w-full"
            playsInline
            preload="auto"
            controls={false}
          />
        </div>
      )}

      {!hasDirectAudio && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="space-y-2 py-3 text-sm">
            <p>
              未找到可截取的视频原声
              {media?.type === "embed" ? "（嵌入页无法精确截取单句）" : ""}。
            </p>
            {remoteUrl ? (
              <p>
                检测到远程链接，可先尝试解析直链，或
                <button
                  type="button"
                  className="mx-1 text-primary underline"
                  onClick={() => ensureLocalMedia(materialId, remoteUrl)}
                >
                  下载到本地
                </button>
                后再跟读。
              </p>
            ) : (
              <p>
                请在
                <Link
                  href={`/resources?materialId=${materialId}`}
                  className="mx-1 text-primary underline"
                >
                  资源页
                </Link>
                补充 B站/YouTube 链接或上传本地视频。
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardDescription>
            第 {lineIndex + 1} / {queue.length} 句
            {currentLine && (
              <span className="ml-2 text-xs">
                {currentLine.start.toFixed(1)}s – {currentLine.end.toFixed(1)}s
              </span>
            )}
          </CardDescription>
          <CardTitle className="text-xl leading-loose">
            {currentLine && isJa ? (
              <JapaneseRubyText
                text={currentLine.text}
                readings={readingMap}
              />
            ) : (
              currentLine?.text
            )}
          </CardTitle>
          <CardDescription>{currentLine?.translation}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress
            value={((lineIndex + 1) / Math.max(queue.length, 1)) * 100}
          />

          <div className="flex gap-2">
            <Button
              onClick={playOriginalAudio}
              disabled={isPlaying || isRecording || !currentLine || !hasDirectAudio}
            >
              {isPlaying ? "原声播放中..." : "播放原声并跟读"}
            </Button>
            <Button variant="outline" onClick={nextLine}>
              下一句
            </Button>
          </div>

          {playError && (
            <p className="text-sm text-destructive">{playError}</p>
          )}

          {isRecording && (
            <p className="animate-pulse text-primary">正在录音...</p>
          )}

          {userSpeech && (
            <div className="rounded bg-muted p-3">
              <p className="text-sm text-muted-foreground">你的跟读</p>
              <p className="leading-loose">
                {isJa ? (
                  <JapaneseRubyText text={userSpeech} readings={readingMap} />
                ) : (
                  userSpeech
                )}
              </p>
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
