/**
 * 句型讲解质量与去重：
 * - 笼统占位文案不展示、不写入
 * - 语法点 / 固定搭配 / 俚语跨句去重
 */

const GENERIC_GRAMMAR = [
  "关注主谓结构、时态与关键搭配",
  "关注句尾谓语、助词搭配与惯用表达",
  "关注句尾谓语与助词搭配",
  "关注主谓结构与关键搭配",
  "句型",
];

export function isGenericGrammar(grammar?: string): boolean {
  const g = grammar?.trim() ?? "";
  if (!g) return true;
  if (GENERIC_GRAMMAR.includes(g)) return true;
  // 仅含笼统套话、无具体点
  if (
    /^(关注|注意)(主谓|句尾|时态|语法|搭配)/.test(g) &&
    !/【|固定搭配|俚语|习惯用法|语法点/.test(g) &&
    g.length < 40
  ) {
    return true;
  }
  return false;
}

/** 是否有可展示的具体句型讲解 */
export function hasDisplayableGrammar(grammar?: string): boolean {
  return !isGenericGrammar(grammar);
}

function normalizePointKey(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[「」『』""''（）()【】\[\]]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * 从 grammar 文本拆出可比对的「知识点」key：
 * - 【固定搭配】短语 — …
 * - 【俚语】…
 * - 【语法点】…
 * - 按行 / 分号拆分的普通要点
 */
export function extractGrammarPointKeys(grammar: string): string[] {
  const g = grammar.trim();
  if (!g || isGenericGrammar(g)) return [];

  const keys = new Set<string>();
  const tagged =
    g.matchAll(/【([^】]+)】\s*([^—\n–-]*)\s*[—–-]?\s*([^\n]*)/g);
  for (const m of tagged) {
    const kind = m[1]?.trim() ?? "";
    const phrase = (m[2]?.trim() || m[3]?.trim() || "").trim();
    if (phrase) keys.add(normalizePointKey(`${kind}:${phrase}`));
    else if (kind) keys.add(normalizePointKey(kind));
  }

  for (const line of g.split(/\n+/)) {
    const t = line.trim();
    if (!t || /^【/.test(t)) continue;
    // 跳过过短的笼统句
    if (t.length < 8) continue;
    if (isGenericGrammar(t)) continue;
    keys.add(normalizePointKey(t.slice(0, 80)));
  }

  return [...keys];
}

export type GrammarParts = {
  points: string[];
  collocations: { phrase: string; usage: string }[];
  idioms: { phrase: string; usage: string }[];
};

/** 组装可展示的 grammar；若过滤后为空则返回 "" */
export function composeGrammarText(
  parts: GrammarParts,
  knownKeys: Set<string>
): string {
  const lines: string[] = [];

  for (const p of parts.points) {
    const t = p.trim();
    if (!t || isGenericGrammar(t)) continue;
    const key = normalizePointKey(t.slice(0, 80));
    if (knownKeys.has(key)) continue;
    knownKeys.add(key);
    lines.push(t);
  }

  for (const c of parts.collocations) {
    const phrase = c.phrase?.trim();
    const usage = c.usage?.trim();
    if (!phrase || !usage) continue;
    const key = normalizePointKey(`固定搭配:${phrase}`);
    if (knownKeys.has(key)) continue;
    knownKeys.add(key);
    lines.push(`【固定搭配】${phrase} — ${usage}`);
  }

  for (const c of parts.idioms) {
    const phrase = c.phrase?.trim();
    const usage = c.usage?.trim();
    if (!phrase || !usage) continue;
    const key = normalizePointKey(`俚语:${phrase}`);
    if (knownKeys.has(key)) continue;
    knownKeys.add(key);
    lines.push(`【俚语/习惯用法】${phrase} — ${usage}`);
  }

  return lines.join("\n");
}

/** 从已有句型列表收集已展示过的知识点 */
export function collectKnownGrammarKeys(
  patterns: { grammar?: string }[],
  excludeIds?: Set<string>,
  idOf?: (p: { grammar?: string }, i: number) => string
): Set<string> {
  const known = new Set<string>();
  patterns.forEach((p, i) => {
    const id = idOf?.(p, i);
    if (id && excludeIds?.has(id)) return;
    for (const k of extractGrammarPointKeys(p.grammar ?? "")) {
      known.add(k);
    }
  });
  return known;
}

/** 清洗已存笼统 grammar（写回空串） */
export function sanitizeStoredGrammar(grammar?: string): string {
  if (!grammar?.trim()) return "";
  if (isGenericGrammar(grammar)) return "";
  return grammar.trim();
}
