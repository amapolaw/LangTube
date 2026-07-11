import fs from "fs/promises";
import path from "path";
import type { AgentTask } from "@langtube/core";
import { getDataDir } from "./paths";

function getAgentTasksDir() {
  return path.join(getDataDir(), "agent-tasks");
}

function getTaskPath(id: string) {
  return path.join(getAgentTasksDir(), `${id}.json`);
}

export async function writeAgentTask(task: AgentTask): Promise<void> {
  await fs.mkdir(getAgentTasksDir(), { recursive: true });
  await fs.writeFile(getTaskPath(task.id), JSON.stringify(task, null, 2));
}

export async function readAgentTask(id: string): Promise<AgentTask | null> {
  try {
    const raw = await fs.readFile(getTaskPath(id), "utf-8");
    return JSON.parse(raw) as AgentTask;
  } catch {
    return null;
  }
}

export async function listAgentTasks(
  status?: AgentTask["status"] | AgentTask["status"][]
): Promise<AgentTask[]> {
  try {
    const dir = getAgentTasksDir();
    const entries = await fs.readdir(dir);
    const tasks: AgentTask[] = [];
    for (const file of entries) {
      if (!file.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(dir, file), "utf-8");
      const task = JSON.parse(raw) as AgentTask;
      if (!status) {
        tasks.push(task);
      } else if (Array.isArray(status)) {
        if (status.includes(task.status)) tasks.push(task);
      } else if (task.status === status) {
        tasks.push(task);
      }
    }
    return tasks.sort(
      (a, b) =>
        new Date(b.updatedAt ?? b.createdAt).getTime() -
        new Date(a.updatedAt ?? a.createdAt).getTime()
    );
  } catch {
    return [];
  }
}

export async function updateAgentTaskStatus(
  id: string,
  status: AgentTask["status"],
  error?: string
): Promise<AgentTask | null> {
  const task = await readAgentTask(id);
  if (!task) return null;
  task.status = status;
  task.updatedAt = new Date().toISOString();
  if (error) task.error = error;
  else delete task.error;
  await writeAgentTask(task);
  return task;
}

export async function completeAgentTask(id: string): Promise<void> {
  await updateAgentTaskStatus(id, "completed");
}

export async function failAgentTask(id: string, error: string): Promise<void> {
  await updateAgentTaskStatus(id, "pending", error);
}

export async function createParseListeningTask(input: {
  id: string;
  sourceUrl?: string | null;
  title: string;
  sourceLang: string;
  level: string;
  learningGoal: string;
  localPath?: string;
  mediaFilename?: string;
}): Promise<AgentTask> {
  const now = new Date().toISOString();
  const task: AgentTask = {
    id: input.id,
    type: "parse-listening",
    status: "pending",
    input: {
      sourceUrl: input.sourceUrl ?? "",
      title: input.title,
      sourceLang: input.sourceLang,
      level: input.level,
      learningGoal: input.learningGoal,
      ...(input.localPath ? { localPath: input.localPath } : {}),
      ...(input.mediaFilename ? { mediaFilename: input.mediaFilename } : {}),
    },
    createdAt: now,
    updatedAt: now,
  };
  await writeAgentTask(task);
  return task;
}
