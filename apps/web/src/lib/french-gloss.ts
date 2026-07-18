/** 法语常用词中文释义（避免机器翻译误译） */

export const FR_COMMON_ZH: Record<string, string> = {
  vierge: "处女的；原始的；未开发的；纯洁的",
  forêt: "森林",
  foret: "森林",
  livre: "书",
  serpent: "蛇",
  boa: "蟒蛇；王蛇",
  proie: "猎物",
  mâcher: "咀嚼",
  macher: "咀嚼",
  dessin: "图画；素描",
  éléphant: "大象",
  elephant: "大象",
  chasseur: "猎人",
  prince: "王子",
  princesse: "公主",
  planete: "星球",
  planète: "星球",
  rose: "玫瑰",
  renard: "狐狸",
  avion: "飞机",
  mouton: "羊",
  baobab: "猴面包树",
  géographique: "地理的",
  geographique: "地理的",
  lorsque: "当…时",
  une: "一个；某一",
  fois: "次；回",
  six: "六",
  ans: "岁；年",
  lire: "读",
  lu: "读（过去分词）",
  avoir: "有；拥有",
  être: "是；在",
  aller: "去",
  faire: "做；使",
  dire: "说",
  voir: "看",
  petit: "小的",
  grand: "大的",
  monde: "世界",
  étoile: "星星",
  etoile: "星星",
  nuit: "夜晚",
  jour: "白天；天",
  eau: "水",
  soleil: "太阳",
  lune: "月亮",
  ami: "朋友",
  amour: "爱",
  rire: "笑",
  pleurer: "哭",
  comprendre: "理解",
  important: "重要的",
  seul: "独自的；唯一的",
  seule: "独自的；唯一的",
  jamais: "从不",
  toujours: "总是",
  encore: "还；再",
  déjà: "已经",
  deja: "已经",
  peut: "可能",
  peux: "能",
  très: "很；非常",
  tres: "很；非常",
  bien: "好；很好地",
  aussi: "也",
  mais: "但是",
  parce: "因为",
  quand: "当…时",
  où: "哪里",
  ou: "或者；哪里",
  comment: "怎样",
  pourquoi: "为什么",
  quelque: "某个；一些",
  chaque: "每个",
  tout: "全部；所有",
  tous: "所有",
  toute: "整个；全部",
  toutes: "所有（阴性复数）",
  même: "同样的；甚至",
  meme: "同样的；甚至",
  sans: "没有；不",
  avec: "和；带有",
  dans: "在…里",
  sur: "在…上",
  sous: "在…下",
  entre: "在…之间",
  chez: "在…家；在…处",
  comme: "像；如同",
  // Easy French 高频
  paris: "巴黎",
  habiter: "居住；住在",
  aimer: "爱；喜欢",
  vivre: "生活；居住",
  ville: "城市",
  pays: "国家；乡下",
  français: "法语；法国的",
  francaise: "法语；法国的",
  française: "法语；法国的",
  france: "法国",
  question: "问题",
  réponse: "回答",
  reponse: "回答",
  parler: "说话；讲",
  venir: "来",
  rester: "留下；待在",
  chercher: "寻找",
  trouver: "找到",
  travailler: "工作",
  étudier: "学习",
  etudier: "学习",
  maison: "家；房子",
  appartement: "公寓",
  rue: "街道",
  métro: "地铁",
  metro: "地铁",
  bus: "公交车",
  train: "火车",
  voiture: "汽车",
  travail: "工作",
  école: "学校",
  ecole: "学校",
  université: "大学",
  universite: "大学",
  amie: "朋友（女）",
  famille: "家庭",
  parent: "父母；家长",
  parents: "父母",
  enfant: "孩子",
  gens: "人们",
  personne: "人",
  chose: "事情；东西",
  temps: "时间；天气",
  soir: "晚上",
  matin: "早上",
  "aujourd'hui": "今天",
  demain: "明天",
  hier: "昨天",
  maintenant: "现在",
  ici: "这里",
  là: "那里",
  beaucoup: "很多",
  peu: "少；一点",
  trop: "太；过于",
  vraiment: "真的；确实",
  mal: "坏；糟糕",
  bon: "好的",
  bonne: "好的（阴）",
  beau: "美丽的",
  belle: "美丽的（阴）",
  nouveau: "新的",
  nouvelle: "新的（阴）；新闻",
  vieux: "老的",
  vieille: "老的（阴）",
  jeune: "年轻的",
};

/** 固定搭配 → 词在搭配中的释义 */
const FR_COLLOCATION_ZH: Array<{
  pattern: RegExp;
  word: string;
  zh: string;
}> = [
  {
    pattern: /for[eê]t\s+vierge/i,
    word: "vierge",
    zh: "原始的；未开发的",
  },
  {
    pattern: /for[eê]t\s+vierge/i,
    word: "forêt",
    zh: "森林",
  },
  {
    pattern: /for[eê]t\s+vierge/i,
    word: "foret",
    zh: "森林",
  },
  {
    pattern: /serpent\s+boa/i,
    word: "boa",
    zh: "蟒蛇",
  },
  {
    pattern: /serpent\s+boa/i,
    word: "serpent",
    zh: "蛇",
  },
  {
    pattern: /habitez[- ]vous/i,
    word: "habiter",
    zh: "居住；住在",
  },
  {
    pattern: /\bà\s+paris\b/i,
    word: "paris",
    zh: "巴黎",
  },
  {
    pattern: /petit\s+prince/i,
    word: "petit",
    zh: "小的",
  },
  {
    pattern: /petit\s+prince/i,
    word: "prince",
    zh: "王子",
  },
];

/** 已知错误机翻（词 → 应拒绝的释义片段） */
const FR_BAD_ZH: Record<string, string[]> = {
  vierge: ["第一", "巡回", "上诉", "法院", "法庭"],
  forêt: ["四重", "奏"],
  foret: ["四重", "奏"],
  livre: ["磅", "英镑"],
  fois: ["时代", "时报"],
};

export function lookupFrenchCollocationZh(
  contextLine: string,
  word: string
): string | undefined {
  const w = word.trim().toLowerCase();
  for (const { pattern, word: target, zh } of FR_COLLOCATION_ZH) {
    if (target === w && pattern.test(contextLine)) return zh;
  }
  return undefined;
}

export function lookupCommonFrenchZh(
  word: string,
  contextLine?: string
): string | undefined {
  const w = word.trim().toLowerCase();
  if (contextLine?.trim()) {
    const col = lookupFrenchCollocationZh(contextLine, w);
    if (col) return col;
  }
  return FR_COMMON_ZH[w];
}

export function isBadFrenchGloss(word: string, zh: string): boolean {
  const w = word.trim().toLowerCase();
  const t = zh.trim();
  if (!t) return true;

  const blocked = FR_BAD_ZH[w];
  if (blocked?.some((b) => t.includes(b))) return true;

  // 法律/司法术语误译到普通词
  if (/巡回|上诉|法院|法庭|第一/.test(t) && !/tribunal|appel|cour|justice/.test(w)) {
    return true;
  }

  // 过长且与常用表完全不符
  const common = FR_COMMON_ZH[w];
  if (common && t.split(/[,，；;\s]+/).length >= 4) {
    const hint = common.slice(0, 2);
    if (hint && !t.includes(hint)) return true;
  }

  return false;
}
