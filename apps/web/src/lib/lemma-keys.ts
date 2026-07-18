import type { SupportedLanguage } from "@langtube/core";
import { guessSpanishLemma } from "@/lib/spanish-lemmatize";
import { guessFrenchLemma } from "@/lib/french-lemmatize";

/** 词汇去重 / 已解析判定用的规范 key（纯函数，可安全用于客户端） */
export function vocabKey(word: string, lang: SupportedLanguage): string {
  const w = word.trim();
  if (!w) return "";
  return lang === "ja" ? w : w.toLowerCase();
}

/** 同步猜测字典型（与服务端 resolveLemma 尽量一致；无 Node/fs 依赖） */
export function guessLemmaKey(
  surface: string,
  lang: SupportedLanguage
): string {
  const s = surface.trim();
  if (!s) return "";
  if (lang === "ja") return s;

  if (lang === "es") {
    const lower = s.toLowerCase();
    if (/mente$/i.test(lower) && lower.length > 6) {
      return lower.slice(0, -5);
    }
    return guessSpanishLemma(s);
  }

  const lower = s.toLowerCase();

  const irregular: Record<string, string> = {
    am: "be",
    is: "be",
    are: "be",
    was: "be",
    were: "be",
    been: "be",
    being: "be",
    has: "have",
    had: "have",
    having: "have",
    does: "do",
    did: "do",
    doing: "done",
    went: "go",
    gone: "go",
    going: "go",
    said: "say",
    made: "make",
    took: "take",
    came: "come",
    saw: "see",
    knew: "know",
    got: "get",
    gave: "give",
    found: "find",
    thought: "think",
    told: "tell",
    became: "become",
    left: "leave",
    felt: "feel",
    brought: "bring",
    began: "begin",
    kept: "keep",
    held: "hold",
    wrote: "write",
    stood: "stand",
    heard: "hear",
    let: "let",
    meant: "mean",
    set: "set",
    put: "put",
    ran: "run",
    children: "child",
    men: "man",
    women: "woman",
    people: "person",
    feet: "foot",
    teeth: "tooth",
    mice: "mouse",
    geese: "goose",
  };
  if (irregular[lower]) return irregular[lower];

  if (lang === "en") {
    if (/ies$/i.test(lower) && lower.length > 4) {
      return lower.slice(0, -3) + "y";
    }
    if (/ing$/i.test(lower) && lower.length > 5) {
      const base = lower.slice(0, -3);
      if (/([b-df-hj-np-tv-z])\1$/.test(base)) return base.slice(0, -1);
      if (base.endsWith("ie")) return base.slice(0, -2) + "y";
      return base;
    }
    if (/ed$/i.test(lower) && lower.length > 4) {
      if (lower.endsWith("ied")) return lower.slice(0, -3) + "y";
      const base = lower.slice(0, -2);
      if (/([b-df-hj-np-tv-z])\1$/.test(base)) return base.slice(0, -1);
      return base;
    }
    if (/es$/i.test(lower) && lower.length > 4) {
      const stem = lower.slice(0, -2);
      if (/[sxz]$|[cs]h$/.test(stem)) return stem;
    }
    if (/s$/i.test(lower) && lower.length > 3 && !lower.endsWith("ss")) {
      return lower.slice(0, -1);
    }
    if (/ly$/i.test(lower) && lower.length > 4) {
      return lower.slice(0, -2);
    }
  }

  if (lang === "fr") {
    return guessFrenchLemma(s);
  }

  return lower;
}
