import { NextResponse } from "next/server";
import { getBaiduAuthUrl } from "@langtube/cloud-adapters";
import { resolveProviderCredentials } from "@/lib/cloud-providers-service";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const providerId = searchParams.get("providerId") ?? undefined;
  const creds = resolveProviderCredentials("baidu", providerId);

  if (!creds?.clientId) {
    return NextResponse.json(
      { error: "请先配置百度云盘 App Key", needsConfig: true, providerId },
      { status: 400 }
    );
  }

  const url = getBaiduAuthUrl({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret ?? "",
    redirectUri: creds.redirectUri ?? "",
  });
  return NextResponse.json({ url, providerId: creds.id });
}
