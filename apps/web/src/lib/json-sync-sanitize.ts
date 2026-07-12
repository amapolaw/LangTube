/** 修复跨设备同步时混入的 PowerShell `` `n `` 等非法 JSON 片段 */
export function sanitizeSyncedJsonText(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\\`n/g, "\n")
    .replace(/`n/g, "\n")
    // 去掉 JSON 字符串中非法控制字符（保留换行/制表）
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
}

export function safeParseJson<T>(text: string): T | null {
  const sanitized = sanitizeSyncedJsonText(text);
  if (!sanitized) return null;
  try {
    return JSON.parse(sanitized) as T;
  } catch {
    return null;
  }
}
