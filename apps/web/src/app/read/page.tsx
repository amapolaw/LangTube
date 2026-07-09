import Link from "next/link";
import { readIndex } from "@/lib/data";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ReadIndexPage() {
  const index = await readIndex();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">读 — 影子跟读</h1>
      <p className="text-muted-foreground">选择资料，逐句跟读并获取相似度评分</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {index.materials.map((m) => (
          <Link key={m.id} href={`/read/shadow/${m.id}`}>
            <Card className="transition hover:border-primary">
              <CardHeader>
                <CardTitle>{m.title}</CardTitle>
                <CardDescription>{m.sourceLang.toUpperCase()}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
