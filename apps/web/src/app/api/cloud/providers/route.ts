import { NextResponse } from "next/server";
import {
  getCloudProviders,
  upsertCloudProvider,
  deleteCloudProvider,
  getCloudProvider,
} from "@/lib/cloud-providers-service";
import { getSession } from "@/lib/cloud-session-service";

export async function GET() {
  const providers = getCloudProviders();
  const merged = providers.map((p) => {
    const session = getSession(p.id);
    return {
      ...p,
      connected: session?.connected ?? false,
      sessionUsername: session?.username,
    };
  });
  return NextResponse.json(merged);
}

export async function POST(req: Request) {
  const body = await req.json();
  const provider = upsertCloudProvider(body);
  return NextResponse.json(provider);
}

export async function PUT(req: Request) {
  const body = await req.json();
  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const existing = getCloudProvider(body.id);
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const provider = upsertCloudProvider({ ...existing, ...body });
  return NextResponse.json(provider);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  deleteCloudProvider(id);
  return NextResponse.json({ ok: true });
}
