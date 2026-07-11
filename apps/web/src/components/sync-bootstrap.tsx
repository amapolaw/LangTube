"use client";

import { useEffect, useRef, useState } from "react";

export function SyncBootstrap() {
  const ran = useRef(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pull" }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          pulled?: number;
          error?: string;
        };
        if (!res.ok) {
          setHint(data.error || data.message || "GitHub 拉取失败");
          return;
        }
        if (data.message?.includes("未配置")) {
          setHint("未配置 GitHub 仓库/Token，跨设备同步不可用。请到设置页填写。");
        }
      })
      .catch(() => {
        setHint("无法连接同步接口");
      });
  }, []);

  if (!hint) return null;

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-900 dark:text-amber-100">
      {hint}
      <button
        type="button"
        className="ml-3 underline"
        onClick={() => setHint(null)}
      >
        关闭
      </button>
    </div>
  );
}
