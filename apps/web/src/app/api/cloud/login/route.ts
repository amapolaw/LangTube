import { NextResponse } from "next/server";
import {
  loginBaiduPan,
  loginBaiduPanSms,
  loginQuarkPan,
  loginQuarkPanSms,
  sendBaiduSmsCode,
  sendQuarkSmsCode,
  verifyBaiduSession,
  verifyQuarkSession,
  parseManualBaiduSecrets,
  type BaiduSmsContextPayload,
} from "@langtube/cloud-adapters";
import { getCloudProvider } from "@/lib/cloud-providers-service";
import {
  saveSession,
  clearSession,
  getAllSessions,
  sealTransientPayload,
  openTransientPayload,
} from "@/lib/cloud-session-service";
import type { CloudAuthType, CloudProviderType, CloudSessionSecrets } from "@langtube/core";

type LoginMode = "password" | "sms" | "session";

function isTimeoutError(err: unknown) {
  return (
    err instanceof Error &&
    (err.name === "TimeoutError" || err.name === "AbortError")
  );
}

function persistLogin(
  providerId: string,
  type: CloudProviderType,
  authType: CloudAuthType,
  username: string,
  secrets: CloudSessionSecrets
) {
  saveSession({
    providerId,
    type,
    authType,
    username,
    connected: true,
    secrets,
  });
  return NextResponse.json({ connected: true, username });
}

export async function GET() {
  return NextResponse.json(getAllSessions());
}

export async function POST(req: Request) {
  const body = await req.json();
  const {
    providerId,
    mode = "password",
    username,
    password,
    phone,
    smsCode,
    smsCtx: sealedSmsCtx,
    vcode,
    vcodeStr,
    bduss,
    stoken,
    cookies,
    accessToken,
    displayName,
  } = body as {
    providerId?: string;
    mode?: LoginMode;
    username?: string;
    password?: string;
    phone?: string;
    smsCode?: string;
    smsCtx?: string;
    vcode?: string;
    vcodeStr?: string;
    bduss?: string;
    stoken?: string;
    cookies?: string;
    accessToken?: string;
    displayName?: string;
  };

  if (!providerId) {
    return NextResponse.json({ error: "providerId 必填" }, { status: 400 });
  }

  const provider = getCloudProvider(providerId);
  if (!provider) {
    return NextResponse.json({ error: "网盘不存在" }, { status: 404 });
  }

  if (mode === "session") {
    const secrets: CloudSessionSecrets = {
      bduss,
      stoken,
      cookies,
      accessToken,
    };

    if (provider.type === "baidu" || provider.type === "custom") {
      const parsed = parseManualBaiduSecrets(secrets);
      const verified = await verifyBaiduSession(parsed);
      if (!verified.ok) {
        return NextResponse.json(
          { error: verified.error || "会话无效" },
          { status: 401 }
        );
      }
      return persistLogin(
        providerId,
        provider.type,
        "session",
        displayName || verified.username || "百度用户",
        parsed
      );
    }

    if (provider.type === "quark") {
      const verified = await verifyQuarkSession(secrets);
      if (!verified.ok) {
        return NextResponse.json(
          { error: verified.error || "会话无效" },
          { status: 401 }
        );
      }
      return persistLogin(
        providerId,
        provider.type,
        "session",
        displayName || verified.username || "夸克用户",
        secrets
      );
    }

    if (accessToken) {
      return persistLogin(
        providerId,
        provider.type,
        "session",
        displayName || "API 用户",
        { accessToken }
      );
    }

    return NextResponse.json(
      { error: "请提供 Cookie 或 Access Token" },
      { status: 400 }
    );
  }

  if (mode === "sms") {
    if (!phone || !smsCode) {
      return NextResponse.json(
        { error: "手机号和短信验证码必填" },
        { status: 400 }
      );
    }
    if (!sealedSmsCtx) {
      return NextResponse.json(
        { error: "请先获取短信验证码" },
        { status: 400 }
      );
    }

    let smsCtx: BaiduSmsContextPayload;
    try {
      smsCtx = openTransientPayload<BaiduSmsContextPayload>(sealedSmsCtx);
    } catch {
      return NextResponse.json(
        { error: "短信会话已过期，请重新获取验证码" },
        { status: 400 }
      );
    }

    try {
      const result =
        provider.type === "quark"
          ? await loginQuarkPanSms(phone, smsCode)
          : await loginBaiduPanSms(phone, smsCode, smsCtx);

      if ("needsCaptcha" in result && result.needsCaptcha) {
        return NextResponse.json({
          needsCaptcha: true,
          captchaImage: result.captchaImage,
          vcodeStr: result.vcodeStr,
        });
      }
      if (!("ok" in result) || !result.ok) {
        return NextResponse.json(
          { error: "error" in result ? result.error : "登录失败" },
          { status: 401 }
        );
      }

      return persistLogin(providerId, provider.type, "password", result.username, {
        bduss: result.bduss,
        stoken: result.stoken,
        cookies: result.cookies,
        accessToken: result.accessToken,
      });
    } catch (err) {
      const message = isTimeoutError(err)
        ? "登录超时，请检查网络后重试"
        : err instanceof Error
          ? err.message
          : "登录请求失败";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (!username || !password) {
    return NextResponse.json(
      { error: "用户名和密码必填" },
      { status: 400 }
    );
  }

  try {
    const result =
      provider.type === "quark"
        ? await loginQuarkPan(username, password)
        : await loginBaiduPan(username, password, vcode, vcodeStr);

    if ("needsCaptcha" in result && result.needsCaptcha) {
      return NextResponse.json({
        needsCaptcha: true,
        captchaImage: result.captchaImage,
        vcodeStr: result.vcodeStr,
      });
    }

    if (!("ok" in result) || !result.ok) {
      return NextResponse.json(
        { error: "error" in result ? result.error : "登录失败" },
        { status: 401 }
      );
    }

    return persistLogin(providerId, provider.type, "password", result.username, {
      bduss: result.bduss,
      stoken: result.stoken,
      cookies: result.cookies,
      accessToken: result.accessToken,
    });
  } catch (err) {
    const message = isTimeoutError(err)
      ? "登录超时，请检查网络后重试"
      : err instanceof Error
        ? err.message
        : "登录请求失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const providerId = searchParams.get("providerId");
  if (!providerId) {
    return NextResponse.json({ error: "providerId required" }, { status: 400 });
  }
  clearSession(providerId);
  return NextResponse.json({ ok: true });
}
