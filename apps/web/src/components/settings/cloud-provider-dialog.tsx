"use client";

import { useState } from "react";
import type { CloudProviderConfig } from "@langtube/core";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CloudProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider?: CloudProviderConfig | null;
  mode: "add" | "config" | "connect";
  onSaved: () => void;
}

const TEMPLATES: Record<string, Partial<CloudProviderConfig>> = {
  gdrive: {
    name: "Google Drive",
    type: "gdrive",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    redirectUri: "http://localhost:3000/api/cloud/gdrive/callback",
  },
  baidu: {
    name: "百度云盘",
    type: "baidu",
    authType: "password",
  },
  quark: {
    name: "夸克网盘",
    type: "quark",
    authType: "password",
  },
  custom: {
    name: "自定义网盘",
    type: "custom",
    authUrl: "",
    tokenUrl: "",
    redirectUri: "http://localhost:3000/api/cloud/custom/callback",
  },
};

export function CloudProviderDialog({
  open,
  onOpenChange,
  provider,
  mode,
  onSaved,
}: CloudProviderDialogProps) {
  const [form, setForm] = useState<Partial<CloudProviderConfig>>({});
  const [error, setError] = useState("");
  const [template, setTemplate] = useState("baidu");

  function initForm() {
    if (provider) {
      setForm(provider);
    } else {
      setForm({ ...TEMPLATES[template], type: template as CloudProviderConfig["type"] });
    }
    setError("");
  }

  async function handleSave() {
    const res = await fetch("/api/cloud/providers", {
      method: provider?.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        id: provider?.id,
        name: form.name || TEMPLATES[template]?.name,
        type: form.type || template,
      }),
    });
    if (!res.ok) {
      setError("保存失败");
      return;
    }
    onSaved();
    onOpenChange(false);
  }

  async function handleConnect() {
    if (!form.clientId && mode === "connect") {
      setError("请先填写 Client ID 和 Secret，保存后再连接");
      return;
    }
    if (mode === "config" || !provider?.clientId) {
      await handleSave();
    }
    const type = form.type ?? provider?.type ?? "baidu";
    const providerId = provider?.id ?? form.id;
    const res = await fetch(
      `/api/cloud/auth?type=${type}&providerId=${providerId ?? ""}`
    );
    const data = await res.json();
    if (data.needsConfig) {
      setError(data.error || "请先完成配置");
      return;
    }
    if (data.url) {
      window.location.href = data.url;
    } else {
      setError(data.error || "无法获取授权链接");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) initForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "add"
              ? "添加网盘"
              : mode === "connect"
                ? `连接 ${provider?.name ?? form.name}`
                : `配置 ${provider?.name ?? form.name}`}
          </DialogTitle>
          <DialogDescription>
            {form.authType === "password" || template === "baidu" || template === "quark"
              ? "账号密码登录请在列表中点击「连接」。此处可修改显示名称。"
              : "填写 OAuth 应用凭证。无凭证时可在对应网盘开放平台申请。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "add" && (
            <div>
              <Label>网盘类型</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border px-3 text-sm"
                value={template}
                onChange={(e) => {
                  setTemplate(e.target.value);
                  setForm({
                    ...TEMPLATES[e.target.value],
                    type: e.target.value as CloudProviderConfig["type"],
                  });
                }}
              >
                <option value="baidu">百度云盘</option>
                <option value="gdrive">Google Drive</option>
                <option value="quark">夸克网盘</option>
                <option value="custom">自定义 OAuth2</option>
              </select>
            </div>
          )}

          <div>
            <Label>显示名称</Label>
            <Input
              value={form.name ?? ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          {(form.authType !== "password" &&
            form.type !== "baidu" &&
            form.type !== "quark" &&
            template !== "baidu" &&
            template !== "quark") && (
            <>
              <div>
                <Label>Client ID / App Key</Label>
                <Input
                  value={form.clientId ?? ""}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                />
              </div>
              <div>
                <Label>Client Secret</Label>
                <Input
                  type="password"
                  value={form.clientSecret ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, clientSecret: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Redirect URI</Label>
                <Input
                  value={form.redirectUri ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, redirectUri: e.target.value })
                  }
                />
              </div>
              {form.type === "custom" && (
                <>
                  <div>
                    <Label>Auth URL</Label>
                    <Input
                      value={form.authUrl ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, authUrl: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Token URL</Label>
                    <Input
                      value={form.tokenUrl ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, tokenUrl: e.target.value })
                      }
                    />
                  </div>
                </>
              )}
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSave}>
              {mode === "add" ? "添加" : "保存配置"}
            </Button>
            {mode === "connect" &&
              form.authType !== "password" &&
              form.type !== "baidu" &&
              form.type !== "quark" && (
                <Button onClick={handleConnect}>连接授权</Button>
              )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
