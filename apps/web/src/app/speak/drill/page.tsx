"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import type {
  DrillsPack,
  SubstitutionDrill,
  TransformationDrill,
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
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mic } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import {
  calcDrillTimeLimitMs,
  formatTimeLimitLabel,
} from "@/lib/drill-timing";
import { buildReadingMap } from "@/lib/japanese-ruby";
import { JapaneseRubyText } from "@/components/japanese-ruby-text";

const ROUNDS_PER_DRILL = 20;

type Phase = "substitution" | "transformation" | "done";

export default function SpeakDrillPage() {
  const [materials, setMaterials] = useState<{ id: string; title: string }[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [sourceLang, setSourceLang] = useState("ja");
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([]);
  const [drills, setDrills] = useState<DrillsPack | null>(null);
  const [phase, setPhase] = useState<Phase>("substitution");
  const [drillIndex, setDrillIndex] = useState(0);
  const [round, setRound] = useState(0);
  const [response, setResponse] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const [timerProgress, setTimerProgress] = useState(100);
  const [feedback, setFeedback] = useState("");
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [isRecording, setIsRecording] = useState(false);
  const [timeLimitMs, setTimeLimitMs] = useState(3000);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const timeLimitRef = useRef(3000);

  const readingMap = useMemo(
    () => buildReadingMap(vocabulary),
    [vocabulary]
  );

  useEffect(() => {
    fetch("/api/materials")
      .then((r) => r.json())
      .then((data) => {
        setMaterials(data.materials ?? []);
        if (data.materials?.[0]) setMaterialId(data.materials[0].id);
      });
  }, []);

  useEffect(() => {
    if (!materialId) return;
    fetch(`/api/materials/${materialId}`)
      .then((r) => r.json())
      .then((pack) => {
        setSourceLang(pack.manifest?.sourceLang ?? "ja");
        setVocabulary(pack.manifest?.vocabulary ?? []);
        setDrills(pack.drills ?? generateDefaultDrills(pack));
      });
  }, [materialId]);

  const currentDrill =
    phase === "substitution"
      ? drills?.substitution[drillIndex]
      : drills?.transformation[drillIndex];

  const currentRound = currentDrill?.rounds[round % (currentDrill?.rounds.length || 1)];

  const { start: startSpeech, stop: stopSpeech } = useSpeechRecognition({
    lang: sourceLang === "ja" ? "ja-JP" : sourceLang === "es" ? "es-ES" : "en-US",
    onResult: (text) => {
      setResponse(text);
      setIsRecording(false);
    },
    onError: () => setIsRecording(false),
  });

  const startTimer = useCallback((limitMs: number) => {
    timeLimitRef.current = limitMs;
    setTimeLimitMs(limitMs);
    startTimeRef.current = Date.now();
    setTimedOut(false);
    setTimerProgress(100);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const limit = timeLimitRef.current;
      const remaining = Math.max(0, 100 - (elapsed / limit) * 100);
      setTimerProgress(remaining);
      if (elapsed >= limit) {
        setTimedOut(true);
        setFeedback(`超过 ${(limit / 1000).toFixed(1).replace(/\.0$/, "")} 秒！加快速度！`);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 50);
  }, []);

  useEffect(() => {
    if (!currentDrill || !currentRound) return;

    const limit = calcDrillTimeLimitMs({
      basePattern: currentDrill.basePattern,
      expected: currentRound.expected,
      prompt: currentRound.prompt,
      sourceLang,
    });

    setResponse("");
    setFeedback("");
    startTimer(limit);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentDrill, currentRound, sourceLang, startTimer]);

  async function submitResponse(answer?: string) {
    if (!currentDrill || !currentRound) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const finalResponse = answer ?? response;
    const responseTimeMs = Date.now() - startTimeRef.current;
    const correct =
      finalResponse.trim().toLowerCase() ===
      currentRound.expected.trim().toLowerCase();

    await fetch("/api/drill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        materialId,
        drillType: phase,
        drillId: currentDrill.id,
        round: round + 1,
        prompt: currentRound.prompt,
        response: finalResponse,
        expected: currentRound.expected,
        responseTimeMs,
        correct,
        timedOut,
        timeLimitMs: timeLimitRef.current,
      }),
    });

    if (!correct && !timedOut) {
      await fetch("/api/notebook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: currentRound.expected,
          translation: currentDrill.baseZh,
          source: "drill",
          materialId,
        }),
      });
    }

    setFeedback(
      correct
        ? "✓ 正确！"
        : timedOut
          ? "超时 — 继续加速"
          : `✗ 应为：${currentRound.expected}`
    );

    setTimeout(() => {
      const nextRound = round + 1;
      if (nextRound >= ROUNDS_PER_DRILL) {
        if (phase === "substitution") {
          setPhase("transformation");
          setDrillIndex(0);
          setRound(0);
        } else {
          setPhase("done");
        }
      } else {
        setRound(nextRound);
      }
    }, 800);
  }

  const remainingSec = (
    (timeLimitMs * timerProgress) /
    100 /
    1000
  ).toFixed(1);

  if (phase === "done") {
    return (
      <Card className="mx-auto max-w-lg text-center">
        <CardHeader>
          <CardTitle>练习完成！</CardTitle>
          <CardDescription>
            已完成 Substitution 和 Transformation Drill 各 20 轮
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              setPhase("substitution");
              setRound(0);
              setDrillIndex(0);
            }}
          >
            再来一组
          </Button>
        </CardContent>
      </Card>
    );
  }

  const showRuby = sourceLang === "ja";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">说 — FSI Pattern Drill</h1>

      <select
        className="flex h-10 w-full rounded-md border px-3 text-sm"
        value={materialId}
        onChange={(e) => {
          setMaterialId(e.target.value);
          setRound(0);
          setDrillIndex(0);
          setPhase("substitution");
        }}
      >
        {materials.map((m) => (
          <option key={m.id} value={m.id}>
            {m.title}
          </option>
        ))}
      </select>

      <Card>
        <CardHeader>
          <CardTitle>
            {phase === "substitution"
              ? "Substitution Drill"
              : "Transformation Drill"}
          </CardTitle>
          <CardDescription>
            第 {round + 1} / {ROUNDS_PER_DRILL} 轮 ·{" "}
            {formatTimeLimitLabel(timeLimitMs)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentDrill && (
            <>
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm text-muted-foreground">基础句型</p>
                <p className="text-lg font-medium leading-loose">
                  {showRuby ? (
                    <JapaneseRubyText
                      text={currentDrill.basePattern}
                      readings={readingMap}
                    />
                  ) : (
                    currentDrill.basePattern
                  )}
                </p>
                <p className="text-sm">{currentDrill.baseZh}</p>
              </div>

              <div className="rounded-lg border-2 border-primary p-4 text-center">
                <p className="text-sm text-muted-foreground">变体提示</p>
                <p className="text-xl font-bold leading-loose text-primary">
                  {showRuby && currentRound?.prompt ? (
                    <JapaneseRubyText
                      text={currentRound.prompt}
                      readings={readingMap}
                      textClassName="font-bold text-primary"
                    />
                  ) : (
                    currentRound?.prompt
                  )}
                </p>
              </div>

              <Progress
                value={timerProgress}
                className={timedOut ? "bg-destructive" : ""}
              />

              <Tabs
                value={inputMode}
                onValueChange={(v) => setInputMode(v as "text" | "voice")}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="text">文本输入</TabsTrigger>
                  <TabsTrigger value="voice">语音输入</TabsTrigger>
                </TabsList>
              </Tabs>

              {inputMode === "text" ? (
                <Input
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitResponse()}
                  placeholder="输入你的回应..."
                  autoFocus
                  disabled={timedOut && !response}
                />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Button
                    size="lg"
                    variant={isRecording ? "destructive" : "default"}
                    className="h-16 w-16 rounded-full"
                    onClick={() => {
                      if (isRecording) {
                        stopSpeech();
                        setIsRecording(false);
                      } else {
                        setIsRecording(startSpeech());
                      }
                    }}
                  >
                    <Mic className="h-6 w-6" />
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    {isRecording ? "正在聆听..." : "点击麦克风说话"}
                  </p>
                  {response && <p className="text-center">{response}</p>}
                </div>
              )}

              <Button onClick={() => submitResponse()} className="w-full">
                提交 ({remainingSec}s)
              </Button>

              {feedback && (
                <p
                  className={`text-center font-medium ${
                    timedOut ? "text-destructive" : ""
                  }`}
                >
                  {showRuby && feedback.startsWith("✗ 应为：") ? (
                    <>
                      ✗ 应为：
                      <JapaneseRubyText
                        text={feedback.replace("✗ 应为：", "")}
                        readings={readingMap}
                      />
                    </>
                  ) : (
                    feedback
                  )}
                </p>
              )}
            </>
          )}
          {!currentDrill && (
            <p className="text-muted-foreground">
              暂无 Drill 数据。请导入资料或使用 Agent 生成 drills.json
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function generateDefaultDrills(pack: {
  manifest: {
    id: string;
    sourceLang?: string;
    patterns: { id: string; pattern: string; zh: string }[];
  };
}): DrillsPack {
  const patterns = pack.manifest.patterns;
  const isJa = pack.manifest.sourceLang === "ja";

  const subjects = isJa
    ? ["私", "あなた", "彼", "彼女", "私たち"]
    : ["I", "You", "They", "We", "He"];

  const substitution: SubstitutionDrill[] = patterns.slice(0, 2).map((p, i) => ({
    id: `sub-${i + 1}`,
    basePattern: p.pattern,
    baseZh: p.zh,
    slots: [{ name: isJa ? "主语" : "Subject", values: subjects }],
    rounds: Array.from({ length: 20 }, (_, r) => ({
      prompt: isJa
        ? `替换主语（${subjects[r % subjects.length]}）`
        : `替换主语 (${subjects[r % subjects.length]})`,
      expected: p.pattern.replace(
        /^(\S+)/,
        subjects[r % subjects.length] ?? "$1"
      ),
    })),
  }));

  const transformation: TransformationDrill[] = patterns
    .slice(0, 1)
    .map((p, i) => ({
      id: `trans-${i + 1}`,
      basePattern: p.pattern,
      baseZh: p.zh,
      transformType: isJa ? "疑问句" : "Question",
      rounds: Array.from({ length: 20 }, (_, r) => ({
        prompt: r % 2 === 0 ? "改为疑问句" : "改为否定句",
        expected:
          r % 2 === 0
            ? isJa
              ? `${p.pattern.replace(/。$/, "")}か？`
              : `Is ${p.pattern.toLowerCase()}?`
            : isJa
              ? `${p.pattern.replace(/。$/, "")}ない`
              : `Not ${p.pattern}`,
      })),
    }));

  return {
    materialId: pack.manifest.id,
    substitution,
    transformation,
  };
}
