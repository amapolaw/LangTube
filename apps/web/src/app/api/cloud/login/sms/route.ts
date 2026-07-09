import { NextResponse } from "next/server";
import {
  sendBaiduSmsCode,
  sendQuarkSmsCode,
  type BaiduSmsContextPayload,
} from "@langtube/cloud-adapters";
import { getCloudProvider } from "@/lib/cloud-providers-service";
import {
  openTransientPayload,
  sealTransientPayload,
} from "@/lib/cloud-session-service";

export async function POST(req: Request) {
  const body = await req.json();
  const {
    providerId,
    phone,
    smsCtx: sealedSmsCtx,
    vcode,
  } = body as {
    providerId?: string;
    phone?: string;
    smsCtx?: string;
    vcode?: string;
  };

  if (!providerId || !phone) {
    return NextResponse.json(
      { error: "providerId 和手机号必填" },
      { status: 400 }
    );
  }

  const provider = getCloudProvider(providerId);
  if (!provider) {
    return NextResponse.json({ error: "网盘不存在" }, { status: 404 });
  }

  let smsCtx: BaiduSmsContextPayload | undefined;
  if (sealedSmsCtx) {
    try {
      smsCtx = openTransientPayload<BaiduSmsContextPayload>(sealedSmsCtx);
    } catch {
      return NextResponse.json(
        { error: "短信会话已过期，请重新发送" },
        { status: 400 }
      );
    }
  }

  try {
    const result =
      provider.type === "quark"
        ? await sendQuarkSmsCode(phone)
        : await sendBaiduSmsCode(phone, smsCtx, vcode);

    if ("needsCaptcha" in result && result.needsCaptcha) {
      const nextCtx = "smsCtx" in result ? result.smsCtx : smsCtx;
      return NextResponse.json({
        needsCaptcha: true,
        captchaImage: result.captchaImage,
        vcodeStr: result.vcodeStr,
        smsCtx: nextCtx ? sealTransientPayload(nextCtx) : undefined,
      });
    }

    if (!("ok" in result) || !result.ok) {
      return NextResponse.json(
        { error: "error" in result ? result.error : "发送失败" },
        { status: 400 }
      );
    }

    const nextCtx = "smsCtx" in result ? result.smsCtx : smsCtx;
    return NextResponse.json({
      ok: true,
      message: "验证码已发送",
      smsCtx: nextCtx ? sealTransientPayload(nextCtx) : undefined,
    });
  } catch (err) {
    const message =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError")
        ? "发送超时，请检查网络后重试"
        : err instanceof Error
          ? err.message
          : "发送失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
