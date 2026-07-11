/**
 * 语言参考材料目录与等级映射
 * 默认指向本机 Language 学习资料库
 */

import path from "path";
import os from "os";

export function getLanguageMaterialsRoot(): string {
  return (
    process.env.LANGTUBE_LANGUAGE_DIR?.trim() ||
    path.join(os.homedir(), "Documents", "Language")
  );
}

export type LevelBand = {
  /** 资料相对 Language 根目录的路径 */
  path: string;
  /** 对应课程/考试等级 */
  levels: string[];
  label: string;
};

/** 用户资料库中与等级相关的权威材料索引 */
export const LANGUAGE_REFERENCE_CATALOG: Record<
  string,
  LevelBand[]
> = {
  ja: [
    {
      path: "日本語/*日语0-N1级别词汇大全.xls",
      levels: ["N5", "N4", "N3", "N2", "N1"],
      label: "日语0-N1级别词汇大全",
    },
    {
      path: "日本語/*日语红蓝宝书",
      levels: ["N3", "N2", "N1"],
      label: "日语红蓝宝书",
    },
    {
      path: "日本語/はじめての日本語能力試験単語",
      levels: ["N3", "N2", "N1"],
      label: "はじめての日本語能力試験単語",
    },
    {
      path: "日本語/*みんなの日本語",
      levels: ["N5", "N4", "N3"],
      label: "みんなの日本語",
    },
  ],
  en: [
    {
      path: "English/The Usborne First Thousand Words in English (Heather Amery).pdf",
      levels: ["A1", "A2"],
      label: "Usborne First Thousand Words",
    },
    {
      path: "English/新概念英语（第二册).pdf",
      levels: ["A2", "B1"],
      label: "新概念英语第二册",
    },
    {
      path: "English/新概念英语（第三册）.PDF",
      levels: ["B1", "B2"],
      label: "新概念英语第三册",
    },
    {
      path: "English/英文常用句型 .xlsx",
      levels: ["A2", "B1", "B2"],
      label: "英文常用句型",
    },
    {
      path: "English/XDF词根词缀记忆大全.pdf",
      levels: ["B1", "B2", "C1"],
      label: "XDF词根词缀",
    },
  ],
  es: [
    {
      path: "Español/Aula internacional /Aula internacional 1 Nueva Edición A1.pdf",
      levels: ["A1"],
      label: "Aula Internacional 1 (A1)",
    },
    {
      path: "Español/Aula internacional /Aula Internacional 2 Nueva Edición A2.pdf",
      levels: ["A2"],
      label: "Aula Internacional 2 (A2)",
    },
    {
      path: "Español/Aula internacional /Aula Internacional 3 Nueva Edición B1.pdf",
      levels: ["B1"],
      label: "Aula Internacional 3 (B1)",
    },
    {
      path: "Español/Aula internacional /Aula Internacional 4 Nueva Edición B2.1.pdf",
      levels: ["B2"],
      label: "Aula Internacional 4 (B2.1)",
    },
    {
      path: "Español/Aula internacional /Aula Internacional 5 Nueva Edición B2.2.pdf",
      levels: ["B2", "C1"],
      label: "Aula Internacional 5 (B2.2)",
    },
    {
      path: "Español/COMPLETE SPANISH GRAMMAR.pdf",
      levels: ["A2", "B1", "B2"],
      label: "Complete Spanish Grammar",
    },
    {
      path: "Español/Spanish Verb Conjugation.xls",
      levels: ["A1", "A2", "B1", "B2"],
      label: "Spanish Verb Conjugation",
    },
  ],
};

const JLPT_ORDER = ["N5", "N4", "N3", "N2", "N1"];
const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function normalizeLevel(level: string, lang: string): string {
  const raw = (level || "").trim().toUpperCase();
  if (lang === "ja") {
    const m = raw.match(/N[1-5]/);
    return m ? m[0] : "N3";
  }
  const m = raw.match(/[ABC][12]/);
  return m ? m[0] : "B1";
}

/** 目标等级及以下（含）的所有等级 */
export function levelsAtOrBelow(target: string, lang: string): string[] {
  const order = lang === "ja" ? JLPT_ORDER : CEFR_ORDER;
  const t = normalizeLevel(target, lang);
  const idx = order.indexOf(t);
  if (idx < 0) return order.slice(0, 3);
  return order.slice(0, idx + 1);
}

export function levelRank(level: string, lang: string): number {
  const order = lang === "ja" ? JLPT_ORDER : CEFR_ORDER;
  const n = normalizeLevel(level, lang);
  const i = order.indexOf(n);
  return i < 0 ? order.length : i;
}

export function isLevelAllowed(
  wordLevel: string | undefined,
  targetLevel: string,
  lang: string
): boolean {
  if (!wordLevel) return false;
  return levelRank(wordLevel, lang) <= levelRank(targetLevel, lang);
}

export function referencesForLevel(lang: string, level: string): LevelBand[] {
  const bands = LANGUAGE_REFERENCE_CATALOG[lang] ?? [];
  const allowed = new Set(levelsAtOrBelow(level, lang));
  return bands.filter((b) => b.levels.some((l) => allowed.has(l)));
}
