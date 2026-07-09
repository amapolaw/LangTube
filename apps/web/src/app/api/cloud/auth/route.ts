import { NextResponse } from "next/server";
import {
  getCloudProvider,
  resolveProviderCredentials,
  setProviderConnected,
} from "@/lib/cloud-providers-service";

function buildAuthUrl(authUrl: string, params: Record<string, string>): string {
  return `${authUrl}?${new URLSearchParams(params)}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as
    | "gdrive"
    | "baidu"
    | "quark"
    | "custom"
    | null;
  const providerId = searchParams.get("providerId") ?? undefined;

  if (!type) {
    return NextResponse.json({ error: "type required" }, { status: 400 });
  }

  const creds = providerId
    ? getCloudProvider(providerId)
    : resolveProviderCredentials(type, providerId);

  if (!creds?.clientId) {
    return NextResponse.json(
      {
        error: "请先配置 Client ID 和 Secret",
        needsConfig: true,
        providerId: providerId ?? creds?.id,
      },
      { status: 400 }
    );
  }

  const scope =
    type === "gdrive"
      ? "https://www.googleapis.com/auth/drive.readonly"
      : type === "baidu"
        ? "basic,netdisk"
        : "basic";

  const url = buildAuthUrl(
    creds.authUrl ??
      (type === "gdrive"
        ? "https://accounts.google.com/o/oauth2/v2/auth"
        : "https://openapi.baidu.com/oauth/2.0/authorize"),
    {
      client_id: creds.clientId,
      redirect_uri: creds.redirectUri ?? "",
      response_type: "code",
      scope,
      state: creds.id,
      ...(type === "gdrive" ? { access_type: "offline" } : {}),
    }
  );

  return NextResponse.json({ url, providerId: creds.id });
}

export async function POST(req: Request) {
  const { providerId, code } = await req.json();
  const creds = getCloudProvider(providerId);
  if (!creds?.clientId || !creds.tokenUrl) {
    return NextResponse.json({ error: "Provider not configured" }, { status: 400 });
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: creds.clientId,
    client_secret: creds.clientSecret ?? "",
    redirect_uri: creds.redirectUri ?? "",
  });

  const res = await fetch(creds.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    return NextResponse.json({ error: await res.text() }, { status: res.status });
  }

  const tokens = (await res.json()) as { access_token: string };
  setProviderConnected(providerId, true, tokens.access_token);
  return NextResponse.json({ ok: true });
}
