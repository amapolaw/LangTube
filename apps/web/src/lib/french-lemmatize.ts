/** 法语词形 → 动词不定式 / 名词原型（规则 + 不规则表） */

import { FR_COMMON_ZH } from "@/lib/french-gloss";

const ELISION_PREFIX = /^(j|t|m|s|l|c|d|qu|n)'(.+)$/i;

const IRREGULAR: Record<string, string> = {
  // être
  suis: "être",
  es: "être",
  est: "être",
  sommes: "être",
  êtes: "être",
  sont: "être",
  étais: "être",
  etais: "être",
  était: "être",
  etait: "être",
  étions: "être",
  etions: "être",
  étiez: "être",
  etiez: "être",
  étaient: "être",
  etaient: "être",
  serai: "être",
  seras: "être",
  sera: "être",
  serons: "être",
  serez: "être",
  seront: "être",
  serais: "être",
  serait: "être",
  serions: "être",
  seriez: "être",
  seraient: "être",
  fus: "être",
  fut: "être",
  fûmes: "être",
  futes: "être",
  fûtes: "être",
  furent: "être",
  sois: "être",
  soit: "être",
  soyons: "être",
  soyez: "être",
  soient: "être",
  étant: "être",
  etant: "être",
  été: "être",
  ete: "être",
  // avoir
  ai: "avoir",
  as: "avoir",
  a: "avoir",
  avons: "avoir",
  avez: "avoir",
  ont: "avoir",
  avais: "avoir",
  avait: "avoir",
  avions: "avoir",
  aviez: "avoir",
  avaient: "avoir",
  aurai: "avoir",
  auras: "avoir",
  aura: "avoir",
  aurons: "avoir",
  aurez: "avoir",
  auront: "avoir",
  aurais: "avoir",
  aurait: "avoir",
  aurions: "avoir",
  auriez: "avoir",
  auraient: "avoir",
  eu: "avoir",
  eus: "avoir",
  eut: "avoir",
  eûmes: "avoir",
  eumes: "avoir",
  eûtes: "avoir",
  eutes: "avoir",
  eurent: "avoir",
  aie: "avoir",
  aies: "avoir",
  ait: "avoir",
  ayons: "avoir",
  ayez: "avoir",
  aient: "avoir",
  ayant: "avoir",
  // aller
  vais: "aller",
  vas: "aller",
  va: "aller",
  allons: "aller",
  allez: "aller",
  vont: "aller",
  allais: "aller",
  allait: "aller",
  allions: "aller",
  alliez: "aller",
  allaient: "aller",
  irai: "aller",
  iras: "aller",
  ira: "aller",
  irons: "aller",
  irez: "aller",
  iront: "aller",
  irais: "aller",
  irait: "aller",
  irions: "aller",
  iriez: "aller",
  iraient: "aller",
  allé: "aller",
  alle: "aller",
  allée: "aller",
  allées: "aller",
  allés: "aller",
  alla: "aller",
  allai: "aller",
  // habiter
  habite: "habiter",
  habites: "habiter",
  habitons: "habiter",
  habitez: "habiter",
  habitent: "habiter",
  habitais: "habiter",
  habitait: "habiter",
  // faire
  fais: "faire",
  fait: "faire",
  faisons: "faire",
  faites: "faire",
  font: "faire",
  faisais: "faire",
  faisait: "faire",
  faisions: "faire",
  faisiez: "faire",
  faisaient: "faire",
  ferai: "faire",
  feras: "faire",
  fera: "faire",
  ferons: "faire",
  ferez: "faire",
  feront: "faire",
  ferais: "faire",
  ferait: "faire",
  ferions: "faire",
  feriez: "faire",
  feraient: "faire",
  fis: "faire",
  fit: "faire",
  fîmes: "faire",
  fimes: "faire",
  fîtes: "faire",
  fites: "faire",
  firent: "faire",
  faisant: "faire",
  // dire
  dis: "dire",
  dit: "dire",
  disons: "dire",
  dites: "dire",
  disent: "dire",
  disais: "dire",
  disait: "dire",
  disions: "dire",
  disiez: "dire",
  disaient: "dire",
  dirai: "dire",
  diras: "dire",
  dira: "dire",
  dirons: "dire",
  direz: "dire",
  diront: "dire",
  disant: "dire",
  // voir
  vois: "voir",
  voit: "voir",
  voyons: "voir",
  voyez: "voir",
  voient: "voir",
  voyais: "voir",
  voyait: "voir",
  voyions: "voir",
  voyiez: "voir",
  voyaient: "voir",
  verrai: "voir",
  verras: "voir",
  verra: "voir",
  verrons: "voir",
  verrez: "voir",
  verront: "voir",
  voyant: "voir",
  vu: "voir",
  vue: "voir",
  vus: "voir",
  vues: "voir",
  // pouvoir
  peux: "pouvoir",
  peut: "pouvoir",
  pouvons: "pouvoir",
  pouvez: "pouvoir",
  peuvent: "pouvoir",
  pouvais: "pouvoir",
  pouvait: "pouvoir",
  pouvions: "pouvoir",
  pouviez: "pouvoir",
  pouvaient: "pouvoir",
  pourrai: "pouvoir",
  pourras: "pouvoir",
  pourra: "pouvoir",
  pourrons: "pouvoir",
  pourrez: "pouvoir",
  pourront: "pouvoir",
  // vouloir
  veux: "vouloir",
  veut: "vouloir",
  voulons: "vouloir",
  voulez: "vouloir",
  veulent: "vouloir",
  voulais: "vouloir",
  voulait: "vouloir",
  voulions: "vouloir",
  vouliez: "vouloir",
  voulaient: "vouloir",
  // savoir
  sais: "savoir",
  sait: "savoir",
  savons: "savoir",
  savez: "savoir",
  savent: "savoir",
  savais: "savoir",
  savait: "savoir",
  savions: "savoir",
  saviez: "savoir",
  savaient: "savoir",
  // devoir
  dois: "devoir",
  doit: "devoir",
  devons: "devoir",
  devez: "devoir",
  doivent: "devoir",
  devais: "devoir",
  devait: "devoir",
  devions: "devoir",
  deviez: "devoir",
  devaient: "devoir",
  // venir
  viens: "venir",
  vient: "venir",
  venons: "venir",
  venez: "venir",
  viennent: "venir",
  venais: "venir",
  venait: "venir",
  venions: "venir",
  veniez: "venir",
  venaient: "venir",
  venu: "venir",
  venue: "venir",
  // prendre
  prends: "prendre",
  prend: "prendre",
  prenons: "prendre",
  prenez: "prendre",
  prennent: "prendre",
  prenais: "prendre",
  prenait: "prendre",
  prenions: "prendre",
  preniez: "prendre",
  prenaient: "prendre",
  pris: "prendre",
  prise: "prendre",
  // mettre
  mets: "mettre",
  met: "mettre",
  mettons: "mettre",
  mettez: "mettre",
  mettent: "mettre",
  mettais: "mettre",
  mettait: "mettre",
  // connaître / paraître / croire / boire / croire
  connais: "connaître",
  connait: "connaître",
  connaît: "connaître",
  connaissons: "connaître",
  connaissez: "connaître",
  connaissent: "connaître",
  crois: "croire",
  croit: "croire",
  croyons: "croire",
  croyez: "croire",
  croient: "croire",
  // falloir (impersonal)
  faut: "falloir",
  fallait: "falloir",
  // common nouns plural
  enfants: "enfant",
  yeux: "œil",
  cheveux: "cheveu",
  animaux: "animal",
  journaux: "journal",
  hôtel: "hôtel",
};

function normalizeFrenchToken(surface: string): string {
  return surface
    .trim()
    .toLowerCase()
    .normalize("NFC")
    .replace(/\u2019/g, "'");
}

function stripElision(token: string): string {
  const m = token.match(ELISION_PREFIX);
  return m ? m[2] : token;
}

function isInfinitiveForm(lower: string): boolean {
  return /(?:er|ir|re|oir)$/.test(lower) && lower.length > 3;
}

function addCandidates(out: Set<string>, ...candidates: string[]) {
  for (const c of candidates) {
    const t = c.trim().toLowerCase();
    if (t.length >= 2) out.add(t);
  }
}

function regularInfinitiveCandidates(lower: string): string[] {
  const out = new Set<string>();
  if (isInfinitiveForm(lower)) addCandidates(out, lower);

  // -er verbs
  const erEndings: Array<[RegExp, (stem: string) => string]> = [
    [/aient$/, (s) => `${s}er`],
    [/ions$/, (s) => `${s}er`],
    [/iez$/, (s) => `${s}er`],
    [/ais$/, (s) => `${s}er`],
    [/ait$/, (s) => `${s}er`],
    [/ant$/, (s) => `${s}er`],
    [/ent$/, (s) => `${s}er`],
    [/ons$/, (s) => `${s}er`],
    [/ez$/, (s) => `${s}er`],
    [/es$/, (s) => `${s}er`],
    [/ée$/, (s) => `${s.slice(0, -1)}er`],
    [/é$/, (s) => `${s}er`],
  ];
  // 现在式 -e（parle→parler）；排除 -ge/-ce 等名词/形容词（vierge 等）
  if (/e$/.test(lower) && lower.length > 4 && !/(?:ge|ce|ne|le|re|que|gue|age|ige|ege)$/i.test(lower)) {
    const stem = lower.slice(0, -1);
    if (stem.length >= 2 && !/[gck]$/i.test(stem)) {
      addCandidates(out, `${stem}er`);
    }
  }
  for (const [re, fn] of erEndings) {
    if (re.test(lower) && lower.length > 4) {
      const stem = lower.replace(re, "");
      if (stem.length >= 2) addCandidates(out, fn(stem));
    }
  }

  // -ir verbs (finir)
  if (/issons$/.test(lower)) addCandidates(out, lower.replace(/issons$/, "ir"));
  if (/issez$/.test(lower)) addCandidates(out, lower.replace(/issez$/, "ir"));
  if (/issent$/.test(lower)) addCandidates(out, lower.replace(/issent$/, "ir"));
  if (/issais$/.test(lower)) addCandidates(out, lower.replace(/issais$/, "ir"));
  if (/issait$/.test(lower)) addCandidates(out, lower.replace(/issait$/, "ir"));
  if (/issant$/.test(lower)) addCandidates(out, lower.replace(/issant$/, "ir"));
  if (/is$/.test(lower) && lower.length > 4) addCandidates(out, `${lower.slice(0, -1)}ir`);
  if (/it$/.test(lower) && lower.length > 4) addCandidates(out, `${lower.slice(0, -1)}ir`);

  // -re verbs
  if (/ons$/.test(lower) && /[bcdfgklmnprstv]ons$/.test(lower)) {
    addCandidates(out, `${lower.slice(0, -3)}re`);
  }

  // adjective feminine → masculine
  if (/euse$/.test(lower)) addCandidates(out, lower.replace(/euse$/, "eur"));
  if (/ive$/.test(lower)) addCandidates(out, lower.replace(/ive$/, "if"));
  if (/elle$/.test(lower)) addCandidates(out, lower.replace(/elle$/, "el"));

  // plural noun → singular
  if (/aux$/.test(lower) && lower.length > 4) {
    addCandidates(out, lower.replace(/aux$/, "al"));
  }
  if (/eux$/.test(lower) && lower.length > 4) {
    addCandidates(out, lower.replace(/eux$/, "eu"));
  }
  if (/s$/.test(lower) && lower.length > 4 && !/ais|ois|uis|ait|ent|ant|ez$/.test(lower)) {
    addCandidates(out, lower.slice(0, -1));
  }

  return [...out];
}

function scoreCandidate(surface: string, candidate: string): number {
  let score = 0;
  if (candidate === surface) return -100;
  if (isInfinitiveForm(candidate)) score += 40;
  if (IRREGULAR[surface] === candidate) score += 100;
  if (candidate.endsWith("er")) score += 10;
  if (candidate.endsWith("ir")) score += 8;
  if (candidate.endsWith("re") || candidate.endsWith("oir")) score += 6;
  score -= candidate.length * 0.05;
  return score;
}

function pickBestLemma(surface: string, candidates: string[]): string {
  const lower = normalizeFrenchToken(surface);
  if (IRREGULAR[lower]) return IRREGULAR[lower];

  const ranked = candidates
    .filter((c) => c && c !== lower)
    .map((c) => ({ c, score: scoreCandidate(lower, c) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.c ?? lower;
}

/** 同步：字幕词 → 最可能的法语字典形 */
export function guessFrenchLemma(surface: string): string {
  const raw = surface.trim();
  if (!raw) return raw;

  const lower = normalizeFrenchToken(raw);
  const bare = stripElision(lower);

  if (bare in FR_COMMON_ZH) return bare;
  if (lower in FR_COMMON_ZH) return lower;

  if (IRREGULAR[bare]) return IRREGULAR[bare];
  if (IRREGULAR[lower]) return IRREGULAR[lower];
  if (isInfinitiveForm(bare)) return bare;

  const candidates = regularInfinitiveCandidates(bare);
  const lemma = pickBestLemma(bare, candidates);

  // 若还原结果与 bare 相同，保留带省音前缀的 surface 作为字幕形由上层处理
  return lemma;
}

export function resolveFrenchLemma(surface: string): {
  lemma: string;
  surface: string;
} {
  const raw = surface.trim();
  return { lemma: guessFrenchLemma(raw), surface: raw };
}
