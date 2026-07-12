import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type WhisperInvocation = {
  command: string;
  argsPrefix: string[];
};

let cachedInvocation: WhisperInvocation | null | undefined;

async function commandExists(cmd: string): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      await execFileAsync("where", [cmd], { timeout: 3000 });
    } else {
      await execFileAsync("which", [cmd], { timeout: 3000 });
    }
    return true;
  } catch {
    return false;
  }
}

async function pythonModuleExists(module: string): Promise<boolean> {
  const candidates = ["python3", "python"];
  for (const py of candidates) {
    try {
      await execFileAsync(py, ["-m", module, "--help"], { timeout: 8000 });
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

/** 优先 whisper CLI，回退 pip 安装的 `python3 -m whisper` */
export async function resolveWhisperInvocation(): Promise<WhisperInvocation | null> {
  if (cachedInvocation !== undefined) return cachedInvocation;

  if (await commandExists("whisper")) {
    cachedInvocation = { command: "whisper", argsPrefix: [] };
    return cachedInvocation;
  }

  for (const py of ["python3", "python"]) {
    try {
      await execFileAsync(py, ["-m", "whisper", "--help"], { timeout: 8000 });
      cachedInvocation = { command: py, argsPrefix: ["-m", "whisper"] };
      return cachedInvocation;
    } catch {
      // try next
    }
  }

  cachedInvocation = null;
  return null;
}

export async function isWhisperAvailable(): Promise<boolean> {
  return (await resolveWhisperInvocation()) !== null;
}

export function whisperInstallHint(): string {
  return process.platform === "win32"
    ? "安装 whisper：pip install openai-whisper（本地视频语音转写）"
    : "安装 whisper：pip install openai-whisper 或 brew install whisper（本地视频语音转写）";
}
