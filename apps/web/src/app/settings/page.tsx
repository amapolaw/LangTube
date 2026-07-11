"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { UserSettings, CloudProviderConfig } from "@langtube/core";
import { CloudProviderDialog } from "@/components/settings/cloud-provider-dialog";
import { CloudLoginDialog } from "@/components/settings/cloud-login-dialog";
import { Plus, Settings2, Link2, Unlink } from "lucide-react";

type ProviderWithSession = CloudProviderConfig & {
  sessionUsername?: string;
};

function isPasswordAuth(provider: CloudProviderConfig) {
  return (
    provider.authType === "password" ||
    provider.type === "baidu" ||
    provider.type === "quark"
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>({
    targetLang: "ja",
    nativeLang: "zh",
    level: "N3",
    learningGoal: "general",
    dailyReviewLimit: 50,
  });
  const [providers, setProviders] = useState<ProviderWithSession[]>([]);
  const [syncStatus, setSyncStatus] = useState<Record<string, unknown> | null>(
    null
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "config" | "connect">(
    "add"
  );
  const [activeProvider, setActiveProvider] =
    useState<CloudProviderConfig | null>(null);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginProvider, setLoginProvider] =
    useState<CloudProviderConfig | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => d.settings && setSettings(d.settings));
    loadProviders();
  }, []);

  async function loadProviders() {
    const res = await fetch("/api/cloud/providers");
    setProviders(await res.json());
  }

  async function save() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    alert("设置已保存");
  }

  async function syncGitHub(action: "export-json" | "push" | "pull") {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        repo: settings.githubRepo,
        token: settings.githubToken,
      }),
    });
    setSyncStatus(await res.json());
  }

  function openDialog(
    mode: "add" | "config" | "connect",
    provider?: CloudProviderConfig
  ) {
    setDialogMode(mode);
    setActiveProvider(provider ?? null);
    setDialogOpen(true);
  }

  async function handleConnect(provider: CloudProviderConfig) {
    if (provider.type === "gdrive") {
      const res = await fetch(
        `/api/cloud/auth?type=gdrive&providerId=${provider.id}`
      );
      const data = await res.json();
      if (data.needsConfig) {
        openDialog("config", provider);
        return;
      }
      if (data.url) window.location.href = data.url;
      else alert(data.error || "连接失败");
      return;
    }

    setLoginProvider(provider);
    setLoginDialogOpen(true);
  }

  async function handleDisconnect(providerId: string) {
    await fetch(`/api/cloud/login?providerId=${providerId}`, {
      method: "DELETE",
    });
    loadProviders();
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">设置</h1>

      <Card>
        <CardHeader>
          <CardTitle>学习偏好</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>目标语言</Label>
            <select
              className="mt-1 flex h-10 w-full rounded-md border px-3 text-sm"
              value={settings.targetLang}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  targetLang: e.target.value as UserSettings["targetLang"],
                })
              }
            >
              <option value="en">英语</option>
              <option value="ja">日语</option>
              <option value="es">西班牙语</option>
              <option value="fr">法语</option>
            </select>
          </div>
          <div>
            <Label>水平</Label>
            <Input
              value={settings.level}
              onChange={(e) =>
                setSettings({ ...settings, level: e.target.value })
              }
            />
          </div>
          <div>
            <Label>每日复习上限</Label>
            <Input
              type="number"
              value={settings.dailyReviewLimit}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  dailyReviewLimit: parseInt(e.target.value),
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>网盘连接</CardTitle>
              <CardDescription>
                百度/夸克支持账号密码、短信或 Cookie；Google Drive 使用 OAuth
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => openDialog("add")}>
              <Plus className="mr-1 h-4 w-4" />
              添加
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {providers.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.type}
                  {p.connected
                    ? ` · 已连接${p.sessionUsername ? ` · ${p.sessionUsername}` : ""}`
                    : " · 未连接"}
                </p>
              </div>
              <div className="flex gap-1">
                {!isPasswordAuth(p) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openDialog("config", p)}
                    title="高级 OAuth 配置"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                )}
                {p.connected ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDisconnect(p.id)}
                  >
                    <Unlink className="mr-1 h-3 w-3" />
                    断开
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleConnect(p)}
                  >
                    <Link2 className="mr-1 h-3 w-3" />
                    连接
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>LLM（自动解析词汇/句型）</CardTitle>
          <CardDescription>
            在 Cursor IDE 终端运行时可留空 API Key，使用已登录会话；也可配置
            OpenAI / Anthropic 作为备选
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Provider</Label>
            <select
              className="mt-1 flex h-10 w-full rounded-md border px-3 text-sm"
              value={settings.llmProvider ?? "cursor"}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  llmProvider: e.target.value as UserSettings["llmProvider"],
                })
              }
            >
              <option value="cursor">Cursor SDK（推荐，Key 可选）</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          {settings.llmProvider === "cursor" || !settings.llmProvider ? (
            <div>
              <Label>Cursor API Key</Label>
              <Input
                type="password"
                className="mt-1"
                value={settings.cursorApiKey ?? ""}
                onChange={(e) =>
                  setSettings({ ...settings, cursorApiKey: e.target.value })
                }
                placeholder="Cursor Dashboard → API Keys（解析词汇/句型必需）"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Next.js 后台解析需 User API Key；留空则走规则模式 + 机器翻译兜底。
              </p>
            </div>
          ) : (
            <div>
              <Label>API Key</Label>
              <Input
                type="password"
                className="mt-1"
                value={settings.llmApiKey ?? ""}
                onChange={(e) =>
                  setSettings({ ...settings, llmApiKey: e.target.value })
                }
                placeholder="sk-..."
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>平台登录（B站 / 百度网盘）</CardTitle>
          <CardDescription>
            在 Cursor IDE 中登录后，粘贴 B站或百度网盘分享链接即可自动拉字幕并下载视频
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>B站 Cookie（可选）</Label>
            <Input
              className="mt-1 font-mono text-xs"
              value={settings.bilibiliCookies ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, bilibiliCookies: e.target.value })
              }
              placeholder="SESSDATA=...; bili_jct=..."
            />
            <p className="mt-1 text-xs text-muted-foreground">
              在浏览器登录 bilibili.com 后，开发者工具 → Network → 复制 Cookie 请求头。付费/软字幕视频需要此项。
            </p>
          </div>
          <div>
            <Label>yt-dlp 读取浏览器 Cookie</Label>
            <select
              className="mt-1 flex h-10 w-full rounded-md border px-3 text-sm"
              value={settings.ytdlpCookiesFromBrowser ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  ytdlpCookiesFromBrowser: e.target.value || undefined,
                })
              }
            >
              <option value="">不指定（仅用上方 B站 Cookie）</option>
              <option value="chrome">Chrome</option>
              <option value="safari">Safari</option>
              <option value="edge">Edge</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              推荐在 Cursor IDE 终端运行本应用，与 Chrome 登录态共享；YouTube/B站 字幕与下载均可用。
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            百度网盘请在下方「云存储」连接账号；连接后支持 pan.baidu.com 分享链接导入。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GitHub 同步</CardTitle>
          <CardDescription>
            JSON 学习数据（字幕/词汇/进度）自动 push；大视频走网盘
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="amapolaw/LangTube"
            value={settings.githubRepo ?? ""}
            onChange={(e) =>
              setSettings({ ...settings, githubRepo: e.target.value })
            }
          />
          <Input
            type="password"
            placeholder="Token"
            value={settings.githubToken ?? ""}
            onChange={(e) =>
              setSettings({ ...settings, githubToken: e.target.value })
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => syncGitHub("push")}>
              推送到 GitHub
            </Button>
            <Button variant="outline" onClick={() => syncGitHub("pull")}>
              从 GitHub 拉取
            </Button>
            <Button variant="ghost" onClick={() => syncGitHub("export-json")}>
              导出本地 JSON
            </Button>
          </div>
          {syncStatus && (
            <pre className="rounded bg-muted p-2 text-xs">
              {JSON.stringify(syncStatus, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <Button onClick={save}>保存设置</Button>

      <CloudProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        provider={activeProvider}
        mode={dialogMode}
        onSaved={loadProviders}
      />

      <CloudLoginDialog
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
        provider={loginProvider}
        onSuccess={loadProviders}
      />
    </div>
  );
}
