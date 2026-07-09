"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Question {
  id: string;
  type: string;
  question: string;
  options?: string[];
}

export default function AssessmentPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{
    score: number;
    level: string;
  } | null>(null);
  const [language, setLanguage] = useState("ja");

  useEffect(() => {
    fetch("/api/assessment")
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions));
  }, []);

  async function submit() {
    const res = await fetch("/api/assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, answers }),
    });
    setResult(await res.json());
  }

  if (result) {
    return (
      <Card className="mx-auto max-w-lg text-center">
        <CardHeader>
          <CardTitle>测试完成</CardTitle>
          <CardDescription>
            得分：{result.score.toFixed(0)} · 等级：{result.level}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            结果已保存，将用于调整泛听/精听推荐与 Drill 难度
          </p>
          <Button className="mt-4" onClick={() => setResult(null)}>
            重新测试
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">语言能力测试</h1>

      <select
        className="flex h-10 rounded-md border px-3 text-sm"
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
      >
        <option value="en">英语</option>
        <option value="ja">日语</option>
        <option value="es">西班牙语</option>
        <option value="fr">法语</option>
      </select>

      {questions.map((q) => (
        <Card key={q.id}>
          <CardHeader>
            <CardDescription>{q.type}</CardDescription>
            <CardTitle className="text-base">{q.question}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {q.options?.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-muted"
              >
                <input
                  type="radio"
                  name={q.id}
                  value={opt}
                  checked={answers[q.id] === opt}
                  onChange={() =>
                    setAnswers({ ...answers, [q.id]: opt })
                  }
                />
                {opt}
              </label>
            ))}
          </CardContent>
        </Card>
      ))}

      <Button
        onClick={submit}
        disabled={Object.keys(answers).length < questions.length}
      >
        提交测试
      </Button>
    </div>
  );
}
