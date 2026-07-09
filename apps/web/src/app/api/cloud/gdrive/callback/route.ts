import { NextResponse } from "next/server";
import { setProviderConnected } from "@/lib/cloud-providers-service";
import { exchangeGoogleCode } from "@langtube/cloud-adapters";
import { getCloudProvider } from "@/lib/cloud-providers-service";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code) {
    return NextResponse.redirect(new URL("/settings?error=no_code", req.url));
  }

  const creds = state ? getCloudProvider(state) : null;
  const clientId = creds?.clientId ?? process.env.GDRIVE_CLIENT_ID ?? "";
  const clientSecret = creds?.clientSecret ?? process.env.GDRIVE_CLIENT_SECRET ?? "";
  const redirectUri =
    creds?.redirectUri ??
    process.env.GDRIVE_REDIRECT_URI ??
    "http://localhost:3000/api/cloud/gdrive/callback";

  try {
    const tokens = await exchangeGoogleCode(
      { clientId, clientSecret, redirectUri },
      code
    );
    if (state) setProviderConnected(state, true, tokens.access_token);
    return NextResponse.redirect(new URL("/settings?gdrive=connected", req.url));
  } catch (e) {
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(String(e))}`, req.url)
    );
  }
}
