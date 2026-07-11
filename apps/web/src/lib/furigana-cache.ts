/** 客户端平假名注音缓存（按原文） */
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

export async function fetchFuriganaHtml(text: string): Promise<string> {
  const cached = cache.get(text);
  if (cached !== undefined) return cached;

  const pending = inflight.get(text);
  if (pending) return pending;

  const request = (async () => {
    try {
      const res = await fetch("/api/japanese/furigana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`furigana ${res.status}`);
      const data = (await res.json()) as { html?: string };
      const html = data.html ?? text;
      cache.set(text, html);
      return html;
    } finally {
      inflight.delete(text);
    }
  })();

  inflight.set(text, request);
  return request;
}
