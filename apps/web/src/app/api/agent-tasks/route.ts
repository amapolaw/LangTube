import { NextResponse } from "next/server";
import type { AgentTask } from "@langtube/core";
import {
  listAgentTasks,
  readAgentTask,
  updateAgentTaskStatus,
  completeAgentTask,
} from "@/lib/agent-task-service";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const statuses: AgentTask["status"][] | undefined = statusParam
    ? (statusParam.split(",") as AgentTask["status"][])
    : ["pending", "failed", "processing"];

  const tasks = await listAgentTasks(statuses);
  return NextResponse.json({ tasks });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, status, error } = body as {
    id: string;
    status?: "pending" | "processing" | "completed" | "failed";
    error?: string;
  };

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const task = await readAgentTask(id);
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (status === "completed") {
    await completeAgentTask(id);
  } else if (status) {
    await updateAgentTaskStatus(id, status, error);
  }

  const updated = await readAgentTask(id);
  return NextResponse.json(updated);
}
