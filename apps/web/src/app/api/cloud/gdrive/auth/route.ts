import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@langtube/cloud-adapters";
import { resolveProviderCredentials } from "@/lib/cloud-providers-service";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const providerId = searchParams.get("providerId") ?? undefined;
  const creds = resolveProviderCredentials("gdrive", providerId);

  if (!creds?.clientId) {
    return NextResponse.json(
      { error: "请先配置 Google Drive Client ID", needsConfig: true, providerId },
      { status: 400 }
    );
  }

  const url = getGoogleAuthUrl({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret ?? "",
    redirectUri: creds.redirectUri ?? "",
  });
  return NextResponse.json({ url, providerId: creds.id });
}
