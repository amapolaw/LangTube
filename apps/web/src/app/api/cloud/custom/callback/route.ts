import { NextResponse } from "next/server";
import { getCloudProvider, setProviderConnected } from "@/lib/cloud-providers-service";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const providerId = searchParams.get("providerId") ?? searchParams.get("state");
  if (!code || !providerId) {
    return NextResponse.redirect(new URL("/settings?error=no_code", req.url));
  }

  const creds = getCloudProvider(providerId);
  if (!creds?.tokenUrl) {
    return NextResponse.redirect(new URL("/settings?error=no_provider", req.url));
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: creds.clientId ?? "",
    client_secret: creds.clientSecret ?? "",
    redirect_uri: creds.redirectUri ?? "",
  });

  const res = await fetch(creds.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(await res.text())}`, req.url)
    );
  }

  const tokens = (await res.json()) as { access_token: string };
  setProviderConnected(providerId, true, tokens.access_token);
  return NextResponse.redirect(new URL("/settings?cloud=connected", req.url));
}
