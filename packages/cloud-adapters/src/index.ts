export {
  LocalStorageAdapter,
  GoogleDriveAdapter,
  BaiduPanAdapter,
  getStorageAdapter,
  type StorageAdapter,
} from "@langtube/core";

export {
  loginBaiduPan,
  loginBaiduPanSms,
  sendBaiduSmsCode,
  verifyBaiduSession,
  verifyQuarkSession,
  parseManualBaiduSecrets,
  type PasswordLoginResponse,
  type PasswordLoginResult,
  type PasswordLoginCaptcha,
  type PasswordLoginError,
  type BaiduSmsContextPayload,
} from "./baidu-auth.js";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getGoogleAuthUrl(config: OAuthConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.readonly",
    access_type: "offline",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function getBaiduAuthUrl(config: OAuthConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "basic,netdisk",
  });
  return `https://openapi.baidu.com/oauth/2.0/authorize?${params}`;
}

export async function exchangeGoogleCode(
  config: OAuthConfig,
  code: string
): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.statusText}`);
  return res.json();
}

export async function exchangeBaiduCode(
  config: OAuthConfig,
  code: string
): Promise<{ access_token: string; refresh_token?: string }> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });
  const res = await fetch(
    `https://openapi.baidu.com/oauth/2.0/token?${params}`,
    { signal: AbortSignal.timeout(25_000) }
  );
  if (!res.ok) throw new Error(`Baidu token exchange failed: ${res.statusText}`);
  return res.json();
}

const QUARK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function extractCookies(headers: Headers): string {
  const setCookies =
    typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  if (setCookies.length > 0) {
    return setCookies.map((c) => c.split(";")[0]).join("; ");
  }
  return headers.get("set-cookie") ?? "";
}

export async function loginQuarkPan(
  username: string,
  password: string
): Promise<import("./baidu-auth.js").PasswordLoginResponse> {
  const res = await fetch(
    "https://uop.quark.cn/cas/ajax/loginWithNameAndPwd",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": QUARK_UA,
        Referer: "https://pan.quark.cn/",
        Origin: "https://pan.quark.cn",
      },
      body: JSON.stringify({
        loginName: username,
        password,
        autoLogin: true,
      }),
      signal: AbortSignal.timeout(25_000),
    }
  );

  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
    data?: { token?: string };
  } | null;

  const cookies = extractCookies(res.headers);
  if (!data?.success && !cookies) {
    return {
      ok: false,
      error: data?.message || "用户名或密码错误",
    };
  }

  return {
    ok: true,
    username,
    cookies,
    accessToken: data?.data?.token,
  };
}

export async function sendQuarkSmsCode(
  _phone: string
): Promise<import("./baidu-auth.js").PasswordLoginResponse> {
  return {
    ok: false,
    error: "夸克网盘暂不支持短信验证码，请使用账号密码或 Cookie 登录",
  };
}

export async function loginQuarkPanSms(
  _phone: string,
  _smsCode: string
): Promise<import("./baidu-auth.js").PasswordLoginResponse> {
  return {
    ok: false,
    error: "夸克网盘暂不支持短信验证码，请使用账号密码或 Cookie 登录",
  };
}
