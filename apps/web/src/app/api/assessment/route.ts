import { NextResponse } from "next/server";
import { saveAssessmentResult, getLatestAssessment } from "@/lib/notebook-service";
import { writeProfile } from "@/lib/data";

const SAMPLE_QUESTIONS = [
  {
    id: "v1",
    type: "vocabulary",
    question: "「社会工学」の意味は？",
    options: ["社会心理学", "ソーシャルエンジニアリング", "社会学", "工学"],
    correctAnswer: "ソーシャルエンジニアリング",
  },
  {
    id: "g1",
    type: "grammar",
    question: "「〜について」は？",
    options: ["about/regarding", "because of", "instead of", "according to"],
    correctAnswer: "about/regarding",
  },
  {
    id: "l1",
    type: "listening",
    question: "听力理解：选择正确的主题",
    options: ["心理学", "烹饪", "体育", "音乐"],
    correctAnswer: "心理学",
  },
];

export async function GET() {
  return NextResponse.json({ questions: SAMPLE_QUESTIONS });
}

export async function POST(req: Request) {
  const { language, answers } = await req.json();
  let correct = 0;
  for (const q of SAMPLE_QUESTIONS) {
    if (answers[q.id] === q.correctAnswer) correct++;
  }
  const score = (correct / SAMPLE_QUESTIONS.length) * 100;
  const level =
    score >= 80 ? "Advanced" : score >= 60 ? "Intermediate" : "Beginner";

  saveAssessmentResult({ language, score, level, details: { answers } });
  await writeProfile({
    targetLang: language,
    level,
    assessmentScore: score,
    lastAssessment: new Date().toISOString(),
    strengths: score >= 60 ? ["vocabulary"] : [],
    weaknesses: score < 60 ? ["grammar", "listening"] : [],
  });

  const previous = getLatestAssessment(language);
  return NextResponse.json({ score, level, previous });
}
