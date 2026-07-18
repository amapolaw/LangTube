/** 西语常用词中文释义（避免机器翻译误译，如 rutina→芦丁） */
export const ES_COMMON_ZH: Record<string, string> = {
  rutina: "日常；惯例；固定习惯",
  rutinas: "日常；惯例；固定习惯",
  carrera: "职业；赛跑；课程",
  quizás: "也许；可能",
  quizá: "也许；可能",
  "tal vez": "也许；可能",
  viernes: "星期五",
  lunes: "星期一",
  martes: "星期二",
  miércoles: "星期三",
  jueves: "星期四",
  sábado: "星期六",
  domingo: "星期日",
  preparar: "准备",
  copiar: "复制；抄袭",
  despertar: "醒来；唤醒",
  despertarse: "醒来",
  levantarse: "起床",
  ducha: "淋浴",
  desayuno: "早餐",
  desayunar: "吃早餐",
  trabajo: "工作",
  trabajar: "工作",
  metro: "地铁",
  gente: "人们",
  diario: "日常的；日报",
  diaria: "日常的",
  establecido: "固定的；既定的",
  festivo: "节日的；休假的",
  importante: "重要的",
  contrario: "相反的",
  memoria: "记忆；熟记",
  persona: "人",
  animal: "动物",
  fijo: "固定的",
  fija: "固定的",
};

/** 已知错误机翻（词 → 应拒绝的释义） */
const ES_BAD_ZH: Record<string, string[]> = {
  rutina: ["芦丁", "芦丁苷", "芦丁片"],
  carrera: ["赛跑,竞赛,轨道,路线,职业,学业,人生,行,列"],
};

export function isBadSpanishGloss(word: string, zh: string): boolean {
  const w = word.trim().toLowerCase();
  const t = zh.trim();
  if (!t) return true;
  const blocked = ES_BAD_ZH[w];
  if (blocked?.some((b) => t.includes(b))) return true;
  return false;
}

export function lookupCommonSpanishZh(word: string): string | undefined {
  const w = word.trim().toLowerCase();
  return ES_COMMON_ZH[w];
}
