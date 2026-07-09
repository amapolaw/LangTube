import { NextResponse } from "next/server";
import { setProviderConnected, getCloudProvider } from "@/lib/cloud-providers-service";
import { exchangeBaiduCode } from "@langtube/cloud-adapters";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code) {
    return NextResponse.redirect(new URL("/settings?error=no_code", req.url));
  }

  const creds = state ? getCloudProvider(state) : null;
  const clientId = creds?.clientId ?? process.env.BAIDU_APP_KEY ?? "";
  const clientSecret = creds?.clientSecret ?? process.env.BAIDU_SECRET_KEY ?? "";
  const redirectUri =
    creds?.redirectUri ??
    process.env.BAIDU_REDIRECT_URI ??
    "http://localhost:3000/api/cloud/baidu/callback";

  try {
    const tokens = await exchangeBaiduCode(
      { clientId, clientSecret, redirectUri },
      code
    );
    if (state) setProviderConnected(state, true, tokens.access_token);
    return NextResponse.redirect(new URL("/settings?baidu=connected", req.url));
  } catch (e) {
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(String(e))}`, req.url)
    );
  }
}
