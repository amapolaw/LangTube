"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { DrillsPack, SubstitutionDrill, TransformationDrill } from "@langtube/core";
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

const ROUNDS_PER_DRILL = 20;
const TIME_LIMIT_MS = 3000;

type Phase = "substitution" | "transformation" | "done";

export default function SpeakDrillPage() {
  const [materials, setMaterials] = useState<{ id: string; title: string }[]>([]);
  const [materialId, setMaterialId] = useState("");
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

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
      .then((pack) => setDrills(pack.drills ?? generateDefaultDrills(pack)));
  }, [materialId]);

  const currentDrill =
    phase === "substitution"
      ? drills?.substitution[drillIndex]
      : drills?.transformation[drillIndex];

  const currentRound = currentDrill?.rounds[round % currentDrill.rounds.length];

  const { start: startSpeech, stop: stopSpeech } = useSpeechRecognition({
    lang: "ja-JP",
    onResult: (text) => {
      setResponse(text);
      setIsRecording(false);
    },
    onError: () => setIsRecording(false),
  });

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    setTimedOut(false);
    setTimerProgress(100);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / TIME_LIMIT_MS) * 100);
      setTimerProgress(remaining);
      if (elapsed >= TIME_LIMIT_MS) {
        setTimedOut(true);
        setFeedback("超过 3 秒！加快速度！");
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 50);
  }, []);

  useEffect(() => {
    if (currentRound) {
      setResponse("");
      setFeedback("");
      startTimer();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentRound, startTimer]);

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
          <Button onClick={() => { setPhase("substitution"); setRound(0); setDrillIndex(0); }}>
            再来一组
          </Button>
        </CardContent>
      </Card>
    );
  }

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
            {phase === "substitution" ? "Substitution Drill" : "Transformation Drill"}
          </CardTitle>
          <CardDescription>
            第 {round + 1} / {ROUNDS_PER_DRILL} 轮 · 3 秒内回应
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentDrill && (
            <>
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm text-muted-foreground">基础句型</p>
                <p className="text-lg font-medium">{currentDrill.basePattern}</p>
                <p className="text-sm">{currentDrill.baseZh}</p>
              </div>

              <div className="rounded-lg border-2 border-primary p-4 text-center">
                <p className="text-sm text-muted-foreground">变体提示</p>
                <p className="text-xl font-bold text-primary">
                  {currentRound?.prompt}
                </p>
              </div>

              <Progress value={timerProgress} className={timedOut ? "bg-destructive" : ""} />

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
                提交 ({((TIME_LIMIT_MS - (100 - timerProgress) * 30) / 1000).toFixed(1)}s)
              </Button>

              {feedback && (
                <p className={`text-center font-medium ${timedOut ? "text-destructive" : ""}`}>
                  {feedback}
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
  manifest: { id: string; patterns: { id: string; pattern: string; zh: string }[] };
}): DrillsPack {
  const patterns = pack.manifest.patterns;
  const substitution: SubstitutionDrill[] = patterns.slice(0, 2).map((p, i) => ({
    id: `sub-${i + 1}`,
    basePattern: p.pattern,
    baseZh: p.zh,
    slots: [{ name: "主语", values: ["I", "You", "They"] }],
    rounds: Array.from({ length: 20 }, (_, r) => ({
      prompt: `替换主语 (${["I", "You", "They", "We", "He"][r % 5]})`,
      expected: p.pattern.replace(/^(\S+)/, ["I", "You", "They", "We", "He"][r % 5]),
    })),
  }));

  const transformation: TransformationDrill[] = patterns.slice(0, 1).map((p, i) => ({
    id: `trans-${i + 1}`,
    basePattern: p.pattern,
    baseZh: p.zh,
    transformType: "疑问句",
    rounds: Array.from({ length: 20 }, (_, r) => ({
      prompt: r % 2 === 0 ? "改为疑问句" : "改为否定句",
      expected: r % 2 === 0 ? `Is ${p.pattern.toLowerCase()}?` : `Not ${p.pattern}`,
    })),
  }));

  return {
    materialId: pack.manifest.id,
    substitution,
    transformation,
  };
}
