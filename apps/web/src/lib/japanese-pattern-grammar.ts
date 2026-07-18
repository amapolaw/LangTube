import type { GrammarParts } from "@/lib/pattern-grammar";

/** 无 LLM 时对日语字幕句做规则化语法/搭配识别 */
export function inferJapaneseGrammar(text: string): GrammarParts {
  const parts: GrammarParts = {
    points: [],
    collocations: [],
    idioms: [],
  };
  const t = text.replace(/\s+/g, " ");

  if (/てられ[んな]/.test(t)) {
    parts.points.push(
      "【语法点】〜てられない：可能态否定，表示「无法忍受…/没法…」"
    );
  }
  if (/黙って/.test(t)) {
    parts.collocations.push({
      phrase: "黙っている",
      usage: "保持沉默、不说话",
    });
  }
  if (/のかな/.test(t) || /かな[？?]?$/.test(t)) {
    parts.points.push(
      "【语法点】〜（の）かな：自言自语式疑问，「会不会…呢？」"
    );
  }
  if (/っていうか/.test(t)) {
    parts.points.push("【语法点】っていうか：更正说法，「或者说…」");
  }
  if (/ため(だけ)?に/.test(t)) {
    parts.points.push("【语法点】〜（ため）だけに：专门为了…目的");
  }
  if (/てる/.test(t) || /ている/.test(t)) {
    parts.points.push("【语法点】〜ている：动作进行或结果状态");
  }
  if (/んだけど/.test(t)) {
    parts.points.push(
      "【语法点】〜んだけど：口语转折/铺垫，「是…不过…」"
    );
  }
  if (/聞いてほしい/.test(t)) {
    parts.collocations.push({
      phrase: "聞いてほしい",
      usage: "希望对方听我说/听一下",
    });
  }
  if (/ちょっといい/.test(t)) {
    parts.collocations.push({
      phrase: "ちょっといい？",
      usage: "方便占用一点时间吗？",
    });
  }
  if (/改まって/.test(t)) {
    parts.collocations.push({
      phrase: "改まって",
      usage: "郑重其事地、正式地",
    });
  }
  if (/れっきとした/.test(t)) {
    parts.collocations.push({
      phrase: "れっきとした",
      usage: "名副其实的、真正的",
    });
  }
  if (/んの[？?]?$/.test(t)) {
    parts.points.push("【语法点】〜んの：口语疑问/确认，「是…吗？」");
  }
  if (/わけじゃない/.test(t)) {
    parts.points.push("【语法点】〜わけじゃない：并非…、并不是…");
  }

  return parts;
}

/** 释义是否仍是源语言（日语/英语等），而非中文 */
export function isSourceLanguageText(text: string, lang: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/[\u4e00-\u9fff]/.test(t) && !/[\u3040-\u30ff]/.test(t)) return false;
  if (lang === "ja") return /[\u3040-\u30ff\u4e00-\u9fff]/.test(t);
  if (lang === "en") return /^[a-zA-Z\s'.,!?-]+$/.test(t);
  if (lang === "es" || lang === "fr") {
    return /[a-zA-ZÀ-ÿ]/.test(t) && !/[\u4e00-\u9fff]/.test(t);
  }
  return false;
}

function mergeGrammarParts(base: GrammarParts, extra: GrammarParts): GrammarParts {
  return {
    points: [...base.points, ...extra.points],
    collocations: [...base.collocations, ...extra.collocations],
    idioms: [...base.idioms, ...extra.idioms],
  };
}

export { mergeGrammarParts };
