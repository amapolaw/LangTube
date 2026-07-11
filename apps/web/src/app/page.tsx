import Link from "next/link";
import {
  Headphones,
  Mic,
  BookOpen,
  PenLine,
  Library,
  ClipboardCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { readIndex } from "@/lib/data";
import { getDueNotebookCards } from "@/lib/notebook-service";

export const dynamic = "force-dynamic";

const modules = [
  {
    href: "/listen",
    icon: Headphones,
    title: "听",
    desc: "泛听/精听分段，字幕对照，词汇句型",
  },
  {
    href: "/speak/drill",
    icon: Mic,
    title: "说",
    desc: "FSI Pattern Drill，按时长调整回应时限",
  },
  {
    href: "/read",
    icon: BookOpen,
    title: "读",
    desc: "影子跟读，逐句模仿",
  },
  {
    href: "/write/practice",
    icon: PenLine,
    title: "写",
    desc: "薄弱词主题写作练习",
  },
  {
    href: "/notebook",
    icon: BookOpen,
    title: "Notebook",
    desc: "Anki 式间隔重复复习",
  },
  {
    href: "/assessment",
    icon: ClipboardCheck,
    title: "测试",
    desc: "语言能力分级评估",
  },
];

export default async function HomePage() {
  const index = await readIndex();
  const dueCards = getDueNotebookCards();

  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">LangTube</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          个人多语言学习交互平台 — 英语 · 日语 · 西班牙语 · 法语
        </p>
        <div className="mt-4 flex justify-center gap-4">
          <Button asChild>
            <Link href="/resources">导入学习资源</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/notebook">今日复习 ({dueCards.length})</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href}>
            <Card className="h-full transition hover:border-primary">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  <CardTitle>{title}</CardTitle>
                </div>
                <CardDescription>{desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">学习资料索引</h2>
          <Button variant="outline" size="sm" asChild>
            <Link href="/resources">
              <Library className="mr-1 h-4 w-4" />
              管理资源
            </Link>
          </Button>
        </div>
        {index.materials.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              暂无学习资料。请先导入 YouTube/B站链接、上传文件，或使用 Agent 批量解析 Content Pack。
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {index.materials.map((m) => (
              <Link key={m.id} href={`/listen/${m.id}`}>
                <Card className="transition hover:border-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{m.title}</CardTitle>
                    <CardDescription>
                      {m.sourceLang.toUpperCase()} · {m.level} ·{" "}
                      {m.parseStatus === "ready" ? "已解析" : "待解析"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {m.topics.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-secondary px-2 py-0.5 text-xs"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
