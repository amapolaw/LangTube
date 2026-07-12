"use client";

import { Suspense, useState, useEffect } from "react";
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
import {
  MATERIAL_LANGUAGES,
  MATERIAL_LEVELS,
  defaultLevelForLang,
  formDefaultsFromPack,
  appendImportFormFields,
} from "@/lib/material-form";

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
  const [syncing, setSyncing] = useState(true);
  const [importStatus, setImportStatus] = useState("");
  const [sourceLang, setSourceLang] = useState("ja");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: "",
    sourceUrl: "",
    level: "N3",
    learningGoal: "general",
    storageMode: "local",
    storageProvider: "local",
    transcriptText: "",
  });

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);

    fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pull" }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.pulled > 0) {
          setImportStatus(`已从 GitHub 同步 ${d.pulled} 个文件`);
        } else if (d.message?.includes("恢复")) {
          setImportStatus(d.message);
        }
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        setSyncing(false);
      });
  }, []);

  useEffect(() => {
    if (!linkMaterialId) return;
    fetch(`/api/materials/${linkMaterialId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((pack) => {
        if (!pack?.manifest) return;
        const defaults = formDefaultsFromPack(pack);
        setSourceLang(defaults.sourceLang);
        setForm({
          title: defaults.title,
          sourceUrl: defaults.sourceUrl,
          level: defaults.level,
          learningGoal: defaults.learningGoal,
          storageMode: defaults.storageMode,
          storageProvider: defaults.storageProvider,
          transcriptText: "",
        });
      })
      .catch(() => {});
  }, [linkMaterialId]);

  async function handleImport(
    sourceType: string,
    files?: { video?: File | null; subtitle?: File | null }
  ) {
    setLoading(true);
    setImportStatus("正在导入并解析…");
    const fd = new FormData();
    fd.append("sourceType", sourceType);
    appendImportFormFields(
      fd,
      { sourceLang, ...form },
      linkMaterialId ?? undefined
    );
    if (files?.video) fd.append("videoFile", files.video);
    if (files?.subtitle) fd.append("subtitleFile", files.subtitle);
    if (linkMaterialId) fd.append("materialId", linkMaterialId);

    const res = await fetch("/api/materials/import", { method: "POST", body: fd });
    const data = await res.json();
    setLoading(false);

    if (data.id) {
      if (data.parseStatus === "ready") {
        setImportStatus("导入并解析完成，正在前往「听」页面…");
      } else {
        setImportStatus(data.message || "导入完成，部分解析待完善");
      }
      setVideoFile(null);
      setSubtitleFile(null);
      router.push(`/listen?new=${data.id}`);
    } else {
      setImportStatus(data.error || "导入失败");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">导入学习资源</h1>
        <p className="text-muted-foreground">
          支持本地上传、YouTube/B站/百度网盘链接、粘贴字幕。在设置页登录 B站/百度网盘后，粘贴 URL 即可自动下载视频、拉字幕并用 Cursor 全量解析词汇与句型。
        </p>
        {syncing && (
          <p className="mt-1 text-sm text-muted-foreground">正在从 GitHub 拉取最新数据…</p>
        )}
        {importStatus && !syncing && (
          <p className="mt-1 text-sm text-primary">{importStatus}</p>
        )}
        {linkMaterialId && (
          <p className="mt-1 text-sm text-primary">
            正在为学习卡片 {linkMaterialId} 补充/调整资源（基本设置已跟随该卡片）
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>基本设置</CardTitle>
          <CardDescription>
            {linkMaterialId
              ? "已加载该卡片的目标语言、水平、学习目的与存储位置，可按需修改后导入"
              : "导入新资源时使用以下设置"}
          </CardDescription>
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
                  level: defaultLevelForLang(e.target.value),
                }));
              }}
            >
              {MATERIAL_LANGUAGES.map((l) => (
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
              {(MATERIAL_LEVELS[sourceLang] ?? MATERIAL_LEVELS.en).map((l) => (
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
                已登录 B站/百度网盘时可直接粘贴链接；自动拉字幕、下载视频并用 Cursor 全量解析
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
              <CardTitle>本地上传</CardTitle>
              <CardDescription>
                视频与字幕可分别上传；仅视频时自动解析字幕；可只更新其中一项
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="标题"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 rounded-lg border border-dashed p-4">
                  <Label>视频 / 音频</Label>
                  <p className="text-xs text-muted-foreground">
                    mp4、mkv、webm、mov 等
                  </p>
                  <Input
                    type="file"
                    accept="video/*,audio/*,.mp4,.mkv,.webm,.mov"
                    onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                  />
                  {videoFile && (
                    <p className="truncate text-xs text-muted-foreground">
                      已选：{videoFile.name}
                    </p>
                  )}
                </div>
                <div className="space-y-2 rounded-lg border border-dashed p-4">
                  <Label>字幕文件（可选）</Label>
                  <p className="text-xs text-muted-foreground">srt、vtt、txt</p>
                  <Input
                    type="file"
                    accept=".srt,.vtt,.txt"
                    onChange={(e) =>
                      setSubtitleFile(e.target.files?.[0] ?? null)
                    }
                  />
                  {subtitleFile && (
                    <p className="truncate text-xs text-muted-foreground">
                      已选：{subtitleFile.name}
                    </p>
                  )}
                </div>
              </div>
              <Button
                disabled={
                  loading ||
                  (!videoFile && !subtitleFile && !linkMaterialId)
                }
                onClick={() =>
                  handleImport("upload", {
                    video: videoFile,
                    subtitle: subtitleFile,
                  })
                }
              >
                {loading ? "导入中..." : linkMaterialId ? "更新资源" : "导入"}
              </Button>
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
