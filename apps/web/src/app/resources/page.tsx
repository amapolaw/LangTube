"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "next/navigation";

const LANGUAGES = [
  { value: "en", label: "英语" },
  { value: "ja", label: "日语" },
  { value: "es", label: "西班牙语" },
  { value: "fr", label: "法语" },
];

const LEVELS: Record<string, string[]> = {
  en: ["A1", "A2", "B1", "B2", "C1", "C2"],
  ja: ["N5", "N4", "N3", "N2", "N1"],
  es: ["A1", "A2", "B1", "B2", "C1", "C2"],
  fr: ["A1", "A2", "B1", "B2", "C1", "C2"],
};

export default function ResourcesPageWrapper() {
  return (
    <Suspense fallback={<div className="py-12 text-center">加载中...</div>}>
      <ResourcesPage />
    </Suspense>
  );
}

function ResourcesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkMaterialId = searchParams.get("materialId");

  const [loading, setLoading] = useState(false);
  const [sourceLang, setSourceLang] = useState("ja");
  const [form, setForm] = useState({
    title: "",
    sourceUrl: "",
    level: "N3",
    learningGoal: "general",
    storageMode: "local",
    storageProvider: "local",
    transcriptText: "",
  });

  async function handleImport(sourceType: string, file?: File) {
    setLoading(true);
    const fd = new FormData();
    fd.append("sourceType", sourceType);
    fd.append("sourceLang", sourceLang);
    fd.append("nativeLang", "zh");
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    if (file) fd.append("file", file);
    if (linkMaterialId) fd.append("materialId", linkMaterialId);

    const res = await fetch("/api/materials/import", { method: "POST", body: fd });
    const data = await res.json();
    setLoading(false);

    if (data.id) {
      router.push(`/listen/${data.id}`);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">导入学习资源</h1>
        <p className="text-muted-foreground">
          支持本地上传、YouTube/B站链接、粘贴字幕、网盘引用
        </p>
        {linkMaterialId && (
          <p className="mt-1 text-sm text-primary">
            正在为学习卡片 {linkMaterialId} 补充资源
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>基本设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>目标语言</Label>
            <select
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={sourceLang}
              onChange={(e) => {
                setSourceLang(e.target.value);
                setForm((f) => ({
                  ...f,
                  level: LEVELS[e.target.value]?.[2] ?? "B1",
                }));
              }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>水平</Label>
            <select
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
            >
              {(LEVELS[sourceLang] ?? LEVELS.en).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>学习目的</Label>
            <Input
              value={form.learningGoal}
              onChange={(e) =>
                setForm({ ...form, learningGoal: e.target.value })
              }
              placeholder="psychology, cybersecurity, history..."
            />
          </div>
          <div>
            <Label>存储位置</Label>
            <select
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={`${form.storageMode}:${form.storageProvider}`}
              onChange={(e) => {
                const [mode, provider] = e.target.value.split(":");
                setForm({
                  ...form,
                  storageMode: mode,
                  storageProvider: provider,
                });
              }}
            >
              <option value="local:local">本地存储</option>
              <option value="remote:gdrive">Google Drive（远端引用）</option>
              <option value="remote:baidu">百度云盘（远端引用）</option>
              <option value="remote:quark">夸克网盘（远端引用）</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="url">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="url">视频链接</TabsTrigger>
          <TabsTrigger value="upload">本地上传</TabsTrigger>
          <TabsTrigger value="transcript">粘贴字幕</TabsTrigger>
        </TabsList>

        <TabsContent value="url">
          <Card>
            <CardHeader>
              <CardTitle>YouTube / B站 / 网络链接</CardTitle>
              <CardDescription>
                自动尝试拉取字幕；B站/YouTube 支持嵌入播放
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="https://www.bilibili.com/video/BV..."
                value={form.sourceUrl}
                onChange={(e) =>
                  setForm({ ...form, sourceUrl: e.target.value })
                }
              />
              <Input
                placeholder="标题（可选）"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <Button
                disabled={loading || !form.sourceUrl}
                onClick={() => handleImport("url")}
              >
                {loading ? "导入中..." : "导入"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>上传文件</CardTitle>
              <CardDescription>支持 video、audio、pdf、txt、srt</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="标题"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <Input
                type="file"
                accept="video/*,audio/*,.pdf,.txt,.srt"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setForm((f) => ({
                      ...f,
                      title: f.title || file.name,
                    }));
                    handleImport("upload", file);
                  }
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transcript">
          <Card>
            <CardHeader>
              <CardTitle>粘贴字幕/文稿</CardTitle>
              <CardDescription>
                每行一句，格式：目标语 | 中文翻译
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="标题"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <Textarea
                rows={10}
                placeholder={"社会工学とは... | 社会工程学是...\n..."}
                value={form.transcriptText}
                onChange={(e) =>
                  setForm({ ...form, transcriptText: e.target.value })
                }
              />
              <Button
                disabled={loading || !form.transcriptText || !form.title}
                onClick={() => handleImport("transcript")}
              >
                {loading ? "导入中..." : "导入并解析"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
