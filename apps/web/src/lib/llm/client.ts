import { readSettings } from "@/lib/data";
import { getRepoRoot } from "@/lib/paths";
import { ensureCursorSdkStore } from "@/lib/llm/cursor-sdk-store";

type AgentOptions = {
  apiKey?: string;
  model?: { id: string };
  local?: { cwd: string };
};

async function loadCursorSdk() {
  try {
    return await import("@cursor/sdk");
  } catch {
    throw new Error(
      "未找到 @cursor/sdk。请在项目根目录执行 pnpm install，然后重启开发服务器（npm run dev）。"
    );
  }
}

export interface LlmConfig {
  apiKey: string;
  provider: "cursor" | "openai" | "anthropic" | "custom" | "proxy";
  baseUrl?: string;
}

const LOCAL_PROXY_CANDIDATES = [
  "http://127.0.0.1:8765/v1",
  "http://127.0.0.1:8787/v1",
];

function resolveCursorApiKey(
  settings: Awaited<ReturnType<typeof readSettings>>
): string {
  // Cursor 会话模式：仅使用 cursorApiKey / CURSOR_API_KEY，勿复用 openai 的 llmApiKey
  return (
    process.env.CURSOR_API_KEY?.trim() ||
    settings.cursorApiKey?.trim() ||
    ""
  );
}

function resolveLegacyLlmApiKey(
  settings: Awaited<ReturnType<typeof readSettings>>
): string {
  return settings.llmApiKey?.trim() || process.env.LLM_API_KEY?.trim() || "";
}

/**
 * Cursor SDK 会话模式为默认：无 Key 时仍返回 cursor provider，
 * 由 Agent.prompt 使用 Cursor IDE 已登录会话（与公司 Windows 行为一致）。
 */
export async function getLlmConfig(): Promise<LlmConfig | null> {
  const settings = await readSettings();
  const provider =
    settings.llmProvider ??
    (process.env.LLM_PROVIDER as LlmConfig["provider"]) ??
    "cursor";

  if (provider === "openai" || provider === "anthropic" || provider === "custom") {
    const apiKey = resolveLegacyLlmApiKey(settings);
    if (!apiKey) {
      // 无显式 Key 时回退到 Cursor 会话模式
      return { apiKey: resolveCursorApiKey(settings), provider: "cursor" };
    }
    return {
      apiKey,
      provider,
      baseUrl: process.env.LLM_BASE_URL,
    };
  }

  return {
    apiKey: resolveCursorApiKey(settings),
    provider: "cursor",
  };
}

async function probeLocalProxy(): Promise<string | null> {
  const candidates = [
    process.env.LLM_BASE_URL?.trim(),
    ...LOCAL_PROXY_CANDIDATES,
  ].filter(Boolean) as string[];

  for (const baseUrl of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
        method: "GET",
        signal: controller.signal,
        headers: { Authorization: "Bearer cursor-local" },
      }).finally(() => clearTimeout(timer));
      if (res.ok || res.status === 401 || res.status === 404) {
        return baseUrl.replace(/\/$/, "");
      }
    } catch {
      // try next
    }
  }
  return null;
}

const CURSOR_PROMPT_TIMEOUT_MS = Number(
  process.env.CURSOR_PROMPT_TIMEOUT_MS ?? 90_000
);

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} 超时（${ms}ms）`)),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function cursorChatCompletion(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  ensureCursorSdkStore();
  const prompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
  const opts: AgentOptions = {
    model: { id: process.env.CURSOR_MODEL ?? "composer-2.5" },
    local: { cwd: getRepoRoot() },
  };
  if (apiKey) {
    opts.apiKey = apiKey;
  }

  const { Agent } = await loadCursorSdk();
  const result = await withTimeout(
    Agent.prompt(prompt, opts),
    CURSOR_PROMPT_TIMEOUT_MS,
    "Cursor SDK"
  );

  if (result.status === "error" || result.status === "cancelled") {
    throw new Error(
      result.error?.message ?? `Cursor SDK error: ${result.status}`
    );
  }

  const text = result.result?.trim();
  if (!text) {
    throw new Error("Cursor SDK 返回空结果");
  }
  return text;
}

async function openAiCompatibleCompletion(
  baseUrl: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey || "cursor-local"}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL ?? process.env.CURSOR_MODEL ?? "composer-2.5",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI-compatible API error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * 三级调用链：Cursor SDK 会话 → 本地 OpenAI 代理 → 抛错由 enrich-pack 走规则兜底
 */
export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const config = await getLlmConfig();
  if (!config) {
    throw new Error("无法解析 LLM 配置");
  }

  if (config.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      content?: { type: string; text: string }[];
    };
    return data.content?.find((c) => c.type === "text")?.text ?? "";
  }

  if (config.provider === "openai" || config.provider === "custom") {
    const baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
    try {
      return await openAiCompatibleCompletion(
        baseUrl,
        config.apiKey,
        systemPrompt,
        userPrompt
      );
    } catch (openaiErr) {
      const msg =
        openaiErr instanceof Error ? openaiErr.message : String(openaiErr);
      if (/invalid.*api.*key|incorrect api key|401/i.test(msg)) {
        console.warn(
          "[llm] OpenAI Key 无效，回退 Cursor SDK 会话:",
          msg.slice(0, 120)
        );
        const settings = await readSettings();
        return await cursorChatCompletion(
          resolveCursorApiKey(settings),
          systemPrompt,
          userPrompt
        );
      }
      throw openaiErr;
    }
  }

  // cursor（默认）：先试 SDK 会话，失败再试本地代理
  try {
    return await cursorChatCompletion(config.apiKey, systemPrompt, userPrompt);
  } catch (cursorErr) {
    const proxyUrl = await probeLocalProxy();
    if (proxyUrl) {
      try {
        return await openAiCompatibleCompletion(
          proxyUrl,
          "cursor-local",
          systemPrompt,
          userPrompt
        );
      } catch {
        // fall through
      }
    }
    throw cursorErr instanceof Error
      ? cursorErr
      : new Error(String(cursorErr));
  }
}
