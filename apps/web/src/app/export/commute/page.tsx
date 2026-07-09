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
import { Textarea } from "@/components/ui/textarea";

export default function CommuteExportPage() {
  const [materials, setMaterials] = useState<{ id: string; title: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [markdown, setMarkdown] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState(0);

  useEffect(() => {
    fetch("/api/materials")
      .then((r) => r.json())
      .then((d) => setMaterials(d.materials ?? []));
  }, []);

  async function generate() {
    const res = await fetch("/api/export/commute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        materialIds: selected,
        targetMinutes: 30,
      }),
    });
    const data = await res.json();
    setMarkdown(data.markdown);
    setEstimatedMinutes(data.estimatedMinutes);
  }

  function downloadMd() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `langtube-commute-${Date.now()}.md`;
    a.click();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">通勤离线复习文档</h1>
      <p className="text-muted-foreground">
        生成约 30 分钟阅读量的纯文本复习资料，地铁无网可用
      </p>

      <Card>
        <CardHeader>
          <CardTitle>选择精听摘要素材</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {materials.map((m) => (
            <label key={m.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.includes(m.id)}
                onChange={() =>
                  setSelected((prev) =>
                    prev.includes(m.id)
                      ? prev.filter((x) => x !== m.id)
                      : [...prev, m.id]
                  )
                }
              />
              {m.title}
            </label>
          ))}
        </CardContent>
      </Card>

      <Button onClick={generate}>生成复习文档</Button>

      {markdown && (
        <Card>
          <CardHeader>
            <CardTitle>预览</CardTitle>
            <CardDescription>预计阅读 {estimatedMinutes} 分钟</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea rows={15} value={markdown} readOnly />
            <Button variant="outline" onClick={downloadMd}>
              下载 Markdown
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
