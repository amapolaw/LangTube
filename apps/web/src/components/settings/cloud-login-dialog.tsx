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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CloudLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: CloudProviderConfig | null;
  onSuccess: () => void;
}

type LoginTab = "password" | "sms" | "session";

export function CloudLoginDialog({
  open,
  onOpenChange,
  provider,
  onSuccess,
}: CloudLoginDialogProps) {
  const [tab, setTab] = useState<LoginTab>("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsCtx, setSmsCtx] = useState("");
  const [smsCooldown, setSmsCooldown] = useState(0);
  const [vcode, setVcode] = useState("");
  const [vcodeStr, setVcodeStr] = useState("");
  const [captchaImage, setCaptchaImage] = useState("");
  const [bduss, setBduss] = useState("");
  const [stoken, setStoken] = useState("");
  const [cookies, setCookies] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function resetForm() {
    setTab("password");
    setUsername("");
    setPassword("");
    setPhone("");
    setSmsCode("");
    setSmsCtx("");
    setSmsCooldown(0);
    setVcode("");
    setVcodeStr("");
    setCaptchaImage("");
    setBduss("");
    setStoken("");
    setCookies("");
    setAccessToken("");
    setDisplayName("");
    setError("");
  }

  function handleCaptcha(data: {
    needsCaptcha?: boolean;
    captchaImage?: string;
    vcodeStr?: string;
    smsCtx?: string;
  }) {
    if (data.needsCaptcha) {
      setCaptchaImage(data.captchaImage ?? "");
      setVcodeStr(data.vcodeStr ?? "");
      if (data.smsCtx) setSmsCtx(data.smsCtx);
      setError("请输入图形验证码");
      return true;
    }
    return false;
  }

  async function handleSendSms() {
    if (!provider || !phone) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/cloud/login/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.id,
          phone,
          smsCtx: smsCtx || undefined,
          vcode: vcode || undefined,
        }),
      });
      const data = await res.json();
      if (handleCaptcha(data)) return;
      if (!res.ok) {
        setError(data.error || "发送失败");
        return;
      }
      if (data.smsCtx) setSmsCtx(data.smsCtx);
      setCaptchaImage("");
      setVcode("");
      setError("");
      setSmsCooldown(60);
      const timer = setInterval(() => {
        setSmsCooldown((s) => {
          if (s <= 1) {
            clearInterval(timer);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!provider) return;
    setLoading(true);
    setError("");

    try {
      const mode =
        tab === "password" ? "password" : tab === "sms" ? "sms" : "session";

      const res = await fetch("/api/cloud/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.id,
          mode,
          username: tab === "password" ? username : undefined,
          password: tab === "password" ? password : undefined,
          phone: tab === "sms" ? phone : undefined,
          smsCode: tab === "sms" ? smsCode : undefined,
          smsCtx: tab === "sms" ? smsCtx || undefined : undefined,
          vcode: tab === "password" ? vcode || undefined : undefined,
          vcodeStr: tab === "password" ? vcodeStr || undefined : undefined,
          bduss: tab === "session" ? bduss || undefined : undefined,
          stoken: tab === "session" ? stoken || undefined : undefined,
          cookies: tab === "session" ? cookies || undefined : undefined,
          accessToken: tab === "session" ? accessToken || undefined : undefined,
          displayName: tab === "session" ? displayName || undefined : undefined,
        }),
      });
      const data = await res.json();

      if (handleCaptcha(data)) return;

      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }

      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  const isQuark = provider?.type === "quark";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>登录 {provider?.name ?? "网盘"}</DialogTitle>
          <DialogDescription>
            支持账号密码、手机验证码或粘贴 Cookie / API Token。密码与验证码不会保存。
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as LoginTab);
            setError("");
          }}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="password">账号密码</TabsTrigger>
            <TabsTrigger value="sms">手机验证码</TabsTrigger>
            <TabsTrigger value="session">Cookie / Token</TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <TabsContent value="password" className="mt-0 space-y-4">
              <div>
                <Label>用户名 / 邮箱 / 手机号</Label>
                <Input
                  className="mt-1"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required={tab === "password"}
                />
              </div>
              <div>
                <Label>密码</Label>
                <Input
                  className="mt-1"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required={tab === "password"}
                />
              </div>
            </TabsContent>

            <TabsContent value="sms" className="mt-0 space-y-4">
              {isQuark && (
                <p className="text-sm text-muted-foreground">
                  夸克网盘暂不支持短信登录，请使用账号密码或 Cookie 方式。
                </p>
              )}
              <div>
                <Label>手机号</Label>
                <Input
                  className="mt-1"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="11 位手机号"
                  required={tab === "sms" && !isQuark}
                  disabled={isQuark}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>短信验证码</Label>
                  <Input
                    className="mt-1"
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value)}
                    required={tab === "sms" && !isQuark}
                    disabled={isQuark}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-6 shrink-0"
                  disabled={loading || smsCooldown > 0 || isQuark || !phone}
                  onClick={handleSendSms}
                >
                  {smsCooldown > 0 ? `${smsCooldown}s` : "获取验证码"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="session" className="mt-0 space-y-4">
              <div>
                <Label>显示名称（可选）</Label>
                <Input
                  className="mt-1"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="已连接时展示的名称"
                />
              </div>
              <div>
                <Label>BDUSS（百度，可选）</Label>
                <Input
                  className="mt-1 font-mono text-xs"
                  value={bduss}
                  onChange={(e) => setBduss(e.target.value)}
                  placeholder="从浏览器 Cookie 复制"
                />
              </div>
              <div>
                <Label>STOKEN（百度，可选）</Label>
                <Input
                  className="mt-1 font-mono text-xs"
                  value={stoken}
                  onChange={(e) => setStoken(e.target.value)}
                />
              </div>
              <div>
                <Label>完整 Cookie</Label>
                <textarea
                  className="mt-1 flex min-h-[80px] w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
                  value={cookies}
                  onChange={(e) => setCookies(e.target.value)}
                  placeholder="BDUSS=...; STOKEN=...; 或夸克网盘 Cookie"
                />
              </div>
              <div>
                <Label>Access Token / API 授权（可选）</Label>
                <Input
                  className="mt-1 font-mono text-xs"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="OAuth access_token 或夸克 token"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                至少填写 BDUSS、完整 Cookie 或 Access Token 中的一项；保存前会验证是否有效。
              </p>
            </TabsContent>

            {captchaImage && tab !== "session" && (
              <div>
                <Label>图形验证码</Label>
                <div className="mt-1 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={captchaImage}
                    alt="验证码"
                    className="h-10 rounded border"
                  />
                  <Input
                    value={vcode}
                    onChange={(e) => setVcode(e.target.value)}
                    placeholder="输入验证码"
                  />
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              className="w-full"
              disabled={
                loading ||
                (tab === "sms" && isQuark) ||
                (tab === "session" && !bduss && !cookies && !accessToken)
              }
            >
              {loading
                ? "处理中…"
                : tab === "session"
                  ? "验证并保存"
                  : "登录"}
            </Button>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
