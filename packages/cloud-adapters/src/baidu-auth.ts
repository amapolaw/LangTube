const BAIDU_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 25_000;
const TPL = "netdisk";

export class CookieJar {
  private cookies = new Map<string, string>();

  mergeFrom(headers: Headers) {
    const setCookies =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : [];
    for (const raw of setCookies) {
      this.mergeCookieString(raw.split(";")[0]);
    }
    const legacy = headers.get("set-cookie");
    if (legacy && setCookies.length === 0) {
      for (const part of legacy.split(/,(?=[^;]+?=)/)) {
        this.mergeCookieString(part.split(";")[0].trim());
      }
    }
  }

  loadSnapshot(snapshot: string) {
    const normalized = snapshot
      .replace(/^cookie:\s*/i, "")
      .replace(/\r?\n/g, ";")
      .replace(/;\s*;/g, ";");
    for (const part of normalized.split(";")) {
      this.mergeCookieString(part.trim());
    }
  }

  set(name: string, value: string) {
    this.cookies.set(name, value);
  }

  private mergeCookieString(pair: string) {
    const eq = pair.indexOf("=");
    if (eq <= 0) return;
    this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }

  header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  snapshot(): string {
    return this.header();
  }
}

export interface BaiduLoginContext {
  jar: CookieJar;
  token: string;
  gid: string;
  callback: string;
}

export interface PasswordLoginResult {
  ok: true;
  username: string;
  bduss?: string;
  stoken?: string;
  cookies?: string;
  accessToken?: string;
}

export interface PasswordLoginCaptcha {
  needsCaptcha: true;
  captchaImage?: string;
  vcodeStr?: string;
  vcodeSign?: string;
}

export interface PasswordLoginError {
  ok: false;
  error: string;
}

export type PasswordLoginResponse =
  | PasswordLoginResult
  | PasswordLoginCaptcha
  | PasswordLoginError;

export interface BaiduSmsContextPayload {
  cookies: string;
  token: string;
  gid: string;
  callback: string;
  phone: string;
  vcodeStr?: string;
  vcodeSign?: string;
}

function makeGid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

function makeCallback(): string {
  return `bd__cbs__${Math.random().toString(36).slice(2, 8)}`;
}

function nowMs(): number {
  return Date.now();
}

function parseJsonp<T>(text: string): T {
  const match = text.match(/.*?\(([\s\S]*)\)\s*;?\s*$/);
  if (!match) {
    throw new Error("Invalid JSONP response");
  }
  const json = match[1].replace(/'/g, '"');
  return JSON.parse(json) as T;
}

export async function baiduFetch(
  jar: CookieJar,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("User-Agent", BAIDU_UA);
  const cookie = jar.header();
  if (cookie) headers.set("Cookie", cookie);
  const res = await fetch(url, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  jar.mergeFrom(res.headers);
  return res;
}

export async function prepareBaiduLoginContext(): Promise<
  PasswordLoginResponse & { context?: BaiduLoginContext }
> {
  const jar = new CookieJar();
  const gid = makeGid();
  const callback = makeCallback();

  await baiduFetch(jar, "https://pan.baidu.com/", {
    headers: { Referer: "https://pan.baidu.com/" },
  });

  const apiUrl =
    `https://passport.baidu.com/v2/api/?getapi&tpl=${TPL}` +
    `&subpro=netdisk_web&apiver=v3&tt=${nowMs()}&class=login&gid=${gid}` +
    `&logintype=basicLogin&callback=${callback}`;

  const apiRes = await baiduFetch(jar, apiUrl, {
    headers: { Referer: "https://pan.baidu.com/", Accept: "*/*" },
  });
  const apiText = await apiRes.text();

  let apiData: { data?: { token?: string } };
  try {
    apiData = parseJsonp(apiText);
  } catch {
    return { ok: false, error: "无法解析百度登录令牌响应" };
  }

  const token = apiData.data?.token;
  if (!token || token.includes("should be string")) {
    return { ok: false, error: "无法获取百度登录令牌，请稍后重试" };
  }

  return {
    ok: true,
    username: "",
    context: { jar, token, gid, callback },
  };
}

function restoreContext(payload: BaiduSmsContextPayload): BaiduLoginContext {
  const jar = new CookieJar();
  jar.loadSnapshot(payload.cookies);
  return {
    jar,
    token: payload.token,
    gid: payload.gid,
    callback: payload.callback,
  };
}

export function serializeSmsContext(
  ctx: BaiduLoginContext,
  phone: string,
  extra?: { vcodeStr?: string; vcodeSign?: string }
): BaiduSmsContextPayload {
  return {
    cookies: ctx.jar.snapshot(),
    token: ctx.token,
    gid: ctx.gid,
    callback: ctx.callback,
    phone,
    vcodeStr: extra?.vcodeStr,
    vcodeSign: extra?.vcodeSign,
  };
}

export async function sendBaiduSmsCode(
  phone: string,
  smsCtx?: BaiduSmsContextPayload,
  imageVcode?: string
): Promise<PasswordLoginResponse & { smsCtx?: BaiduSmsContextPayload }> {
  let ctx: BaiduLoginContext;
  if (smsCtx) {
    ctx = restoreContext(smsCtx);
  } else {
    const prepared = await prepareBaiduLoginContext();
    if (!prepared.context) {
      return { ok: false, error: "error" in prepared ? prepared.error : "初始化失败" };
    }
    ctx = prepared.context;
  }

  const sendUrl =
    `https://passport.baidu.com/v2/api/?senddpass&username=${encodeURIComponent(phone)}` +
    `&token=${encodeURIComponent(ctx.token)}&tpl=${TPL}&subpro=netdisk_web` +
    `&apiver=v3&tt=${nowMs()}&gid=${ctx.gid}&callback=${ctx.callback}` +
    `&countrycode=` +
    (smsCtx?.vcodeStr
      ? `&vcodestr=${encodeURIComponent(smsCtx.vcodeStr)}&verifycode=${encodeURIComponent(imageVcode ?? "")}`
      : "");

  const sendRes = await baiduFetch(ctx.jar, sendUrl, {
    headers: { Referer: "https://pan.baidu.com/", Accept: "*/*" },
  });
  const sendText = await sendRes.text();

  let sendData: {
    errInfo?: { no?: string; msg?: string };
    errno?: number;
    data?: { vcodestr?: string; vcodesign?: string };
  };
  try {
    sendData = parseJsonp(sendText);
  } catch {
    return { ok: false, error: "无法解析短信发送响应" };
  }

  const errNo = sendData.errInfo?.no ?? String(sendData.errno ?? "");
  if (errNo === "50020" || errNo === "50052") {
    const vcodeStr = sendData.data?.vcodestr ?? smsCtx?.vcodeStr;
    return {
      needsCaptcha: true,
      captchaImage: vcodeStr
        ? `https://passport.baidu.com/cgi-bin/genimage?${vcodeStr}`
        : undefined,
      vcodeStr,
      vcodeSign: sendData.data?.vcodesign,
      smsCtx: serializeSmsContext(ctx, phone, {
        vcodeStr,
        vcodeSign: sendData.data?.vcodesign,
      }),
    };
  }

  if (errNo !== "0") {
    return {
      ok: false,
      error: sendData.errInfo?.msg || "短信发送失败，请稍后重试",
    };
  }

  return {
    ok: true,
    username: phone,
    smsCtx: serializeSmsContext(ctx, phone, {
      vcodeStr: smsCtx?.vcodeStr,
      vcodeSign: smsCtx?.vcodeSign,
    }),
  };
}

export async function loginBaiduPanSms(
  phone: string,
  smsCode: string,
  smsCtx: BaiduSmsContextPayload
): Promise<PasswordLoginResponse> {
  const ctx = restoreContext(smsCtx);

  const loginBody = new URLSearchParams({
    staticpage: "https://passport.baidu.com/static/passpc-account/html/v3Jump.html",
    charset: "UTF-8",
    token: ctx.token,
    tpl: TPL,
    subpro: "netdisk_web",
    apiver: "v3",
    tt: String(nowMs()),
    codestring: smsCtx.vcodeStr ?? "",
    safeflg: "0",
    u: "https://pan.baidu.com/disk/home",
    isPhone: "1",
    detect: "1",
    gid: ctx.gid,
    quick_user: "0",
    logintype: "basicLogin",
    logLoginType: "pc_loginBasic",
    idc: "",
    loginmerge: "true",
    isdpass: "1",
    foreignusername: "",
    username: phone,
    password: smsCode,
    countrycode: "",
    mem_pass: "on",
    verifycode: "",
    callback: `parent.${ctx.callback}`,
  });

  const loginRes = await baiduFetch(ctx.jar, "https://passport.baidu.com/v2/api/?login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "https://pan.baidu.com/",
    },
    body: loginBody,
    redirect: "manual",
  });

  const loginText = await loginRes.text();

  if (/err_no=(257|6|50020|50052)/.test(loginText)) {
    const codeMatch = loginText.match(/codeString=([^&"']+)/);
    const codeString = codeMatch?.[1];
    return {
      needsCaptcha: true,
      captchaImage: codeString
        ? `https://passport.baidu.com/cgi-bin/genimage?${codeString}`
        : undefined,
      vcodeStr: codeString,
    };
  }

  if (!/err_no=0/.test(loginText)) {
    return { ok: false, error: "验证码错误或已过期" };
  }

  const bduss = ctx.jar.get("BDUSS");
  if (!bduss) {
    const href = loginText.match(/href="([^"]+)"/)?.[1];
    if (href) {
      await baiduFetch(ctx.jar, href, { redirect: "manual" });
    }
  }

  const bdussFinal = ctx.jar.get("BDUSS");
  if (!bdussFinal) {
    return { ok: false, error: "登录成功但未获取到会话，请重试" };
  }

  return {
    ok: true,
    username: phone,
    bduss: bdussFinal,
    stoken: ctx.jar.get("STOKEN"),
    cookies: ctx.jar.snapshot(),
  };
}

export async function loginBaiduPan(
  username: string,
  password: string,
  vcode?: string,
  vcodeStr?: string
): Promise<PasswordLoginResponse> {
  const { publicEncrypt, constants } = await import("node:crypto");
  const prepared = await prepareBaiduLoginContext();
  if (!prepared.context) {
    return { ok: false, error: "error" in prepared ? prepared.error : "初始化失败" };
  }
  const { jar, token, gid, callback } = prepared.context;

  const pubkeyUrl =
    `https://passport.baidu.com/v2/getpublickey?token=${encodeURIComponent(token)}` +
    `&tpl=${TPL}&subpro=netdisk_web&apiver=v3&tt=${nowMs()}&gid=${gid}` +
    `&callback=${callback}`;

  const pubkeyRes = await baiduFetch(jar, pubkeyUrl, {
    headers: { Referer: "https://pan.baidu.com/" },
  });
  const pubkeyText = await pubkeyRes.text();

  let pubkeyData: { pubkey?: string; key?: string };
  try {
    pubkeyData = parseJsonp(pubkeyText);
  } catch {
    return { ok: false, error: "无法解析百度公钥响应" };
  }

  const pubkey = pubkeyData.pubkey;
  const rsakey = pubkeyData.key;
  if (!pubkey || !rsakey) {
    return { ok: false, error: "无法获取百度公钥" };
  }

  const encPassword = publicEncrypt(
    { key: pubkey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(password, "utf8")
  ).toString("base64");

  const loginBody = new URLSearchParams({
    staticpage: "http://pan.baidu.com/res/static/thirdparty/pass_v3_jump.html",
    charset: "utf-8",
    token,
    tpl: TPL,
    subpro: "netdisk_web",
    apiver: "v3",
    tt: String(nowMs()),
    codestring: vcodeStr ?? "",
    safeflg: "0",
    u: "http://pan.baidu.com/disk/home",
    isPhone: "",
    detect: "1",
    gid,
    quick_user: "0",
    logintype: "basicLogin",
    logLoginType: "pc_loginBasic",
    idc: "",
    loginmerge: "true",
    foreignusername: "",
    username,
    password: encPassword,
    verifycode: vcode ?? "",
    mem_pass: "on",
    rsakey,
    crypttype: "12",
    ppui_logintime: String(Math.floor(Math.random() * 50000) + 10000),
    countrycode: "",
    dv: "",
    callback: `parent.${callback}`,
  });

  const loginRes = await baiduFetch(jar, "https://passport.baidu.com/v2/api/?login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "https://pan.baidu.com/",
    },
    body: loginBody,
    redirect: "manual",
  });

  const loginText = await loginRes.text();

  if (/err_no=(257|6|50020|50052)/.test(loginText)) {
    const codeMatch = loginText.match(/codeString=([^&"']+)/);
    const codeString = codeMatch?.[1] ?? vcodeStr ?? "";
    return {
      needsCaptcha: true,
      captchaImage: codeString
        ? `https://passport.baidu.com/cgi-bin/genimage?${codeString}`
        : undefined,
      vcodeStr: codeString || vcodeStr,
    };
  }

  if (!/err_no=0/.test(loginText)) {
    try {
      const loginJson = parseJsonp<{
        errno?: number;
        data?: { vcodestr?: string; vcodeimg?: string };
      }>(loginText);
      if (loginJson.errno === 50052 || loginJson.errno === 50020) {
        return {
          needsCaptcha: true,
          captchaImage: loginJson.data?.vcodeimg,
          vcodeStr: loginJson.data?.vcodestr,
        };
      }
    } catch {
      // HTML response without success flag
    }
    return { ok: false, error: "用户名或密码错误" };
  }

  const bduss = jar.get("BDUSS");
  if (!bduss) {
    const href = loginText.match(/href="([^"]+)"/)?.[1];
    if (href) {
      await baiduFetch(jar, href, { redirect: "manual" });
    }
    const bduss2 = jar.get("BDUSS");
    if (!bduss2) {
      return { ok: false, error: "登录成功但未获取到会话，请重试" };
    }
    return {
      ok: true,
      username,
      bduss: bduss2,
      stoken: jar.get("STOKEN"),
      cookies: jar.snapshot(),
    };
  }

  return {
    ok: true,
    username,
    bduss,
    stoken: jar.get("STOKEN"),
    cookies: jar.snapshot(),
  };
}

export function parseManualBaiduSecrets(input: {
  bduss?: string;
  stoken?: string;
  cookies?: string;
  accessToken?: string;
}): { bduss?: string; stoken?: string; cookies?: string; accessToken?: string } {
  const cookies = normalizeCookieInput(input.cookies ?? "");
  const bdussRaw = normalizeCookieInput(input.bduss ?? "");
  const bduss =
    bdussRaw.replace(/^BDUSS=/i, "") ||
    cookies.match(/(?:^|;\s*)BDUSS=([^;]+)/i)?.[1] ||
    cookies.match(/(?:^|;\s*)BDUSS_BFESS=([^;]+)/i)?.[1];
  const stoken =
    normalizeCookieInput(input.stoken ?? "").replace(/^STOKEN=/i, "") ||
    cookies.match(/(?:^|;\s*)STOKEN=([^;]+)/i)?.[1] ||
    cookies.match(/(?:^|;\s*)STOKEN_BFESS=([^;]+)/i)?.[1];

  let cookieHeader = cookies;
  if (!cookieHeader && bduss) {
    cookieHeader = `BDUSS=${bduss}${stoken ? `; STOKEN=${stoken}` : ""}`;
  }

  return {
    bduss: bduss || undefined,
    stoken: stoken || undefined,
    cookies: cookieHeader || undefined,
    accessToken: input.accessToken?.trim() || undefined,
  };
}

function normalizeCookieInput(raw: string): string {
  return raw
    .replace(/^cookie:\s*/i, "")
    .replace(/\r?\n/g, ";")
    .replace(/;\s*;/g, ";")
    .trim();
}

function baiduErrMessage(errno?: number, showMsg?: string): string {
  if (showMsg?.trim()) return showMsg.trim();
  switch (errno) {
    case -6:
      return "Cookie 无效或已过期。请重新打开 pan.baidu.com 登录后再复制";
    case -9:
      return "Cookie 无效，请确认复制的是 pan.baidu.com 的 Cookie";
    default:
      return "Cookie 无效或已过期";
  }
}

async function verifyBaiduLoginStatus(jar: CookieJar): Promise<{
  ok: boolean;
  username?: string;
  errno?: number;
  showMsg?: string;
}> {
  const res = await baiduFetch(
    jar,
    "https://pan.baidu.com/api/loginStatus?clienttype=0&app_id=250528&web=1",
    { headers: { Referer: "https://pan.baidu.com/disk/main" } }
  );
  const data = (await res.json()) as {
    errno?: number;
    login_status?: number;
    username?: string;
    baidu_name?: string;
    show_msg?: string;
  };
  if (data.errno === 0 && (data.login_status === 1 || data.username)) {
    return {
      ok: true,
      username: data.username || data.baidu_name,
    };
  }
  return {
    ok: false,
    errno: data.errno,
    showMsg: data.show_msg,
  };
}

async function verifyBaiduTemplate(jar: CookieJar): Promise<{
  ok: boolean;
  username?: string;
  errno?: number;
}> {
  const res = await baiduFetch(
    jar,
    "https://pan.baidu.com/api/gettemplatevariable?clienttype=0&app_id=250528&web=1",
    { headers: { Referer: "https://pan.baidu.com/disk/main" } }
  );
  const data = (await res.json()) as {
    errno?: number;
    user?: { username?: string };
  };
  if (data.errno === 0 && data.user?.username) {
    return { ok: true, username: data.user.username };
  }
  return { ok: false, errno: data.errno };
}

export async function verifyBaiduSession(secrets: {
  bduss?: string;
  stoken?: string;
  cookies?: string;
}): Promise<{ ok: boolean; username?: string; error?: string }> {
  const parsed = parseManualBaiduSecrets(secrets);
  if (!parsed.bduss && !parsed.cookies) {
    return {
      ok: false,
      error: "请提供 BDUSS 或完整 Cookie（需包含 BDUSS=...）",
    };
  }

  const jar = new CookieJar();
  if (parsed.cookies) {
    jar.loadSnapshot(parsed.cookies);
  } else if (parsed.bduss) {
    jar.set("BDUSS", parsed.bduss);
    if (parsed.stoken) jar.set("STOKEN", parsed.stoken);
  }

  // 确保 jar 中有 BDUSS
  if (!jar.get("BDUSS") && !jar.get("BDUSS_BFESS")) {
    return {
      ok: false,
      error:
        "Cookie 中未找到 BDUSS。请在 Chrome 登录 pan.baidu.com 后，从 Network 请求头复制完整 Cookie",
    };
  }

  try {
    // 预热：与浏览器访问网盘首页一致
    await baiduFetch(jar, "https://pan.baidu.com/disk/main", {
      headers: { Referer: "https://pan.baidu.com/" },
    });

    const login = await verifyBaiduLoginStatus(jar);
    if (login.ok) {
      return { ok: true, username: login.username };
    }

    const tmpl = await verifyBaiduTemplate(jar);
    if (tmpl.ok) {
      return { ok: true, username: tmpl.username };
    }

    return {
      ok: false,
      error: baiduErrMessage(login.errno ?? tmpl.errno, login.showMsg),
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "验证超时，请检查网络或关闭代理后重试"
        : err instanceof Error
          ? `无法验证 Cookie：${err.message}`
          : "无法验证 Cookie，请检查格式";
    return { ok: false, error: message };
  }
}

export async function verifyQuarkSession(secrets: {
  cookies?: string;
  accessToken?: string;
}): Promise<{ ok: boolean; username?: string; error?: string }> {
  if (!secrets.cookies && !secrets.accessToken) {
    return { ok: false, error: "请提供 Cookie 或 Access Token" };
  }

  const headers: Record<string, string> = {
    "User-Agent": BAIDU_UA,
    Referer: "https://pan.quark.cn/",
  };
  if (secrets.cookies) headers.Cookie = secrets.cookies;
  if (secrets.accessToken) headers.Authorization = `Bearer ${secrets.accessToken}`;

  try {
    const res = await fetch("https://drive-pc.quark.cn/1/clouddrive/member?pr=ucpro&fr=pc", {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, error: "Cookie / Token 无效或已过期" };
    }
    const data = (await res.json().catch(() => null)) as {
      data?: { nickname?: string };
    } | null;
    return { ok: true, username: data?.data?.nickname };
  } catch {
    return { ok: false, error: "验证超时，请检查网络" };
  }
}
