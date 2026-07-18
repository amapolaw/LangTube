/** 西班牙语词形 → 动词原形 / 名词原型（规则 + 不规则表） */

const IRREGULAR: Record<string, string> = {
  // ser
  soy: "ser",
  eres: "ser",
  es: "ser",
  somos: "ser",
  sois: "ser",
  son: "ser",
  fui: "ser",
  fuiste: "ser",
  fue: "ser",
  fuimos: "ser",
  fuisteis: "ser",
  fueron: "ser",
  era: "ser",
  eras: "ser",
  éramos: "ser",
  erais: "ser",
  eran: "ser",
  seré: "ser",
  serás: "ser",
  será: "ser",
  seremos: "ser",
  seréis: "ser",
  serán: "ser",
  // estar
  estoy: "estar",
  estás: "estar",
  está: "estar",
  estamos: "estar",
  estáis: "estar",
  están: "estar",
  estuve: "estar",
  estuviste: "estar",
  estuvo: "estar",
  estuvimos: "estar",
  estuvieron: "estar",
  estaba: "estar",
  estabas: "estar",
  estábamos: "estar",
  estaban: "estar",
  // haber
  he: "haber",
  has: "haber",
  ha: "haber",
  hemos: "haber",
  habéis: "haber",
  han: "haber",
  había: "haber",
  habías: "haber",
  habíamos: "haber",
  habían: "haber",
  hubo: "haber",
  habrá: "haber",
  habrán: "haber",
  // tener
  tengo: "tener",
  tienes: "tener",
  tiene: "tener",
  tenemos: "tener",
  tenéis: "tener",
  tienen: "tener",
  tuve: "tener",
  tuvo: "tener",
  tenía: "tener",
  tenían: "tener",
  // hacer
  hago: "hacer",
  haces: "hacer",
  hace: "hacer",
  hacemos: "hacer",
  hacéis: "hacer",
  hacen: "hacer",
  hice: "hacer",
  hizo: "hacer",
  hacía: "hacer",
  hacían: "hacer",
  // ir
  voy: "ir",
  vas: "ir",
  va: "ir",
  vamos: "ir",
  vais: "ir",
  van: "ir",
  iba: "ir",
  iban: "ir",
  // poder
  puedo: "poder",
  puedes: "poder",
  puede: "poder",
  podemos: "poder",
  pueden: "poder",
  pudo: "poder",
  podía: "poder",
  podían: "poder",
  // decir
  digo: "decir",
  dices: "decir",
  dice: "decir",
  decimos: "decir",
  dicen: "decir",
  dijo: "decir",
  decía: "decir",
  decían: "decir",
  // ver
  veo: "ver",
  ves: "ver",
  ve: "ver",
  vemos: "ver",
  ven: "ver",
  vi: "ver",
  vio: "ver",
  veía: "ver",
  veían: "ver",
  veré: "ver",
  verás: "ver",
  verá: "ver",
  veremos: "ver",
  verán: "ver",
  // saber
  sé: "saber",
  sabes: "saber",
  sabe: "saber",
  sabemos: "saber",
  saben: "saber",
  supe: "saber",
  sabía: "saber",
  sabían: "saber",
  // querer
  quiero: "querer",
  quieres: "querer",
  quiere: "querer",
  queremos: "querer",
  quieren: "querer",
  quiso: "querer",
  quería: "querer",
  querían: "querer",
  // venir
  vengo: "venir",
  vienes: "venir",
  viene: "venir",
  venimos: "venir",
  vienen: "venir",
  vino: "venir",
  venía: "venir",
  venían: "venir",
  // dar
  doy: "dar",
  das: "dar",
  da: "dar",
  damos: "dar",
  dan: "dar",
  dio: "dar",
  daba: "dar",
  daban: "dar",
  // morir
  muero: "morir",
  mueres: "morir",
  muere: "morir",
  morimos: "morir",
  mueren: "morir",
  murió: "morir",
  murieron: "morir",
  muriendo: "morir",
  muerto: "morir",
  muerta: "morir",
  muertos: "morir",
  muertas: "morir",
  // dormir
  duermo: "dormir",
  duermes: "dormir",
  duerme: "dormir",
  duermen: "dormir",
  durmió: "dormir",
  durmieron: "dormir",
  durmiendo: "dormir",
  // pedir / sentir / etc.
  pido: "pedir",
  pides: "pedir",
  pide: "pedir",
  piden: "pedir",
  pidió: "pedir",
  pidieron: "pedir",
  siento: "sentir",
  sientes: "sentir",
  siente: "sentir",
  sienten: "sentir",
  sintió: "sentir",
  sintieron: "sentir",
  miento: "mentir",
  mientes: "mentir",
  miente: "mentir",
  mienten: "mentir",
  mintió: "mentir",
  mintieron: "mentir",
  // seguir
  sigo: "seguir",
  sigues: "seguir",
  sigue: "seguir",
  siguen: "seguir",
  siguió: "seguir",
  siguieron: "seguir",
  // caer / oír / leer / traer
  caigo: "caer",
  caes: "caer",
  cae: "caer",
  caen: "caer",
  cayó: "caer",
  cayeron: "caer",
  caí: "caer",
  oigo: "oír",
  oyes: "oír",
  oye: "oír",
  oyen: "oír",
  oyó: "oír",
  oyeron: "oír",
  leo: "leer",
  lees: "leer",
  lee: "leer",
  leen: "leer",
  leyó: "leer",
  leyeron: "leer",
  traigo: "traer",
  traes: "traer",
  trae: "traer",
  traen: "traer",
  trajo: "traer",
  trajeron: "traer",
  // -cer / -ucir preterite
  conozco: "conocer",
  conoces: "conocer",
  conoce: "conocer",
  conocen: "conocer",
  conoció: "conocer",
  conocieron: "conocer",
  traduzco: "traducir",
  traduce: "traducir",
  tradujo: "traducir",
  produzco: "producir",
  produce: "producir",
  produjo: "producir",
  // 常见规则 -ir
  vivo: "vivir",
  vives: "vivir",
  vive: "vivir",
  vivimos: "vivir",
  viven: "vivir",
  vivió: "vivir",
  vivieron: "vivir",
  viviendo: "vivir",
  escribo: "escribir",
  escribes: "escribir",
  escribe: "escribir",
  escriben: "escribir",
  escribió: "escribir",
  escribieron: "escribir",
  escribiendo: "escribir",
  partió: "partir",
  partieron: "partir",
  recibió: "recibir",
  recibieron: "recibir",
  abrió: "abrir",
  abrieron: "abrir",
  cubrió: "cubrir",
  cubrieron: "cubrir",
  // 常见规则 -er
  comió: "comer",
  comieron: "comer",
  bebió: "beber",
  bebieron: "beber",
  corrió: "correr",
  corrieron: "correr",
  corriendo: "correr",
};

/** 简单过去式/未完成过去式词干 → 原形（o→u、e→i 等变位） */
const PRETERITE_STEM_LEMMA: Record<string, string> = {
  mur: "morir",
  dur: "dormir",
  pid: "pedir",
  ped: "pedir",
  sint: "sentir",
  sent: "sentir",
  mint: "mentir",
  ment: "mentir",
  sigu: "seguir",
  segu: "seguir",
  consigu: "conseguir",
  sirv: "servir",
  serv: "servir",
  vist: "vestir",
  vest: "vestir",
  prefiri: "preferir",
  prefer: "preferir",
  repit: "repetir",
  repet: "repetir",
  sugir: "sugerir",
  suger: "sugerir",
  mid: "medir",
  med: "medir",
  dij: "decir",
  hic: "hacer",
  hiz: "hacer",
  pud: "poder",
  pus: "poner",
  quis: "querer",
  vin: "venir",
  traj: "traer",
  conoci: "conocer",
  traduj: "traducir",
  produj: "producir",
  anduv: "andar",
  estuv: "estar",
  tuv: "tener",
  sup: "saber",
};

function normalizeSpanishToken(word: string): string {
  return word.trim().toLowerCase();
}

function isInfinitiveForm(word: string): boolean {
  return /^[a-záéíóúñü]+(?:ar|er|ir)$/.test(word) && word.length > 3;
}

function isLikelySpanishNounForm(word: string): boolean {
  return (
    /^[a-záéíóúñü]+(?:a|o|e|ción|sión|dad|tad|tud|aje|ancia|encia|ismo|ista|ía|ie|ez)$/i.test(
      word
    ) && word.length >= 4
  );
}

/** 反身不定式：prepararnos → preparar */
function stripReflexiveInfinitive(lower: string): string | undefined {
  const m = lower.match(
    /^(.*(?:ar|er|ir))(me|te|se|nos|os|les|lo|la|los|las)$/
  );
  const base = m?.[1];
  if (base && isInfinitiveForm(base)) return base;
  return undefined;
}

/** 名词复数 → 单数（保守规则，避免 hablas→habla 误判） */
function guessSpanishNounLemma(lower: string): string | undefined {
  if (IRREGULAR[lower]) return undefined;

  const reflexive = stripReflexiveInfinitive(lower);
  if (reflexive) return reflexive;

  if (/inas$/.test(lower) && lower.length >= 5) return lower.slice(0, -1);
  if (/eras$/.test(lower) && lower.length >= 6) return lower.slice(0, -1);
  if (/anas$/.test(lower) && lower.length >= 5) return lower.slice(0, -1);
  if (/iones$/.test(lower) && lower.length >= 6) {
    return lower.replace(/iones$/, "ión");
  }
  if (/ces$/.test(lower) && lower.length >= 5 && /[aeiou]z$/.test(lower.slice(0, -2))) {
    return `${lower.slice(0, -2)}z`;
  }

  if (isLikelySpanishNounForm(lower)) return lower;
  return undefined;
}

function lookupPreteriteStem(stem: string): string | undefined {
  if (PRETERITE_STEM_LEMMA[stem]) return PRETERITE_STEM_LEMMA[stem];
  let best: string | undefined;
  let bestLen = 0;
  for (const [key, lemma] of Object.entries(PRETERITE_STEM_LEMMA)) {
    if (stem.endsWith(key) && key.length > bestLen) {
      best = lemma;
      bestLen = key.length;
    }
  }
  return best;
}

function defaultLemmaFromPreteriteStem(stem: string): string | undefined {
  if (!stem || stem.length < 2) return undefined;
  // 词干以 b/g/v 结尾多为 -ir（escrib-, viv-）
  if (/[bgv]$/.test(stem)) {
    const ir = `${stem}ir`;
    if (isInfinitiveForm(ir)) return ir;
  }
  const er = `${stem}er`;
  if (isInfinitiveForm(er)) return er;
  const ir = `${stem}ir`;
  if (isInfinitiveForm(ir)) return ir;
  return undefined;
}

function addCandidates(out: Set<string>, ...forms: string[]) {
  for (const f of forms) {
    const t = f.trim().toLowerCase();
    if (t.length >= 2 && isInfinitiveForm(t)) out.add(t);
  }
}

/** 规则生成可能的动词原形候选 */
function regularInfinitiveCandidates(lower: string): string[] {
  const out = new Set<string>();

  if (isInfinitiveForm(lower)) addCandidates(out, lower);
  if (IRREGULAR[lower]) addCandidates(out, IRREGULAR[lower]);

  // 复数/三人称未完成过去 -aban / -ían
  if (/aban$/.test(lower)) addCandidates(out, lower.replace(/aban$/, "ar"));
  if (/aba$/.test(lower)) addCandidates(out, lower.replace(/aba$/, "ar"));
  if (/ían$/.test(lower)) {
    addCandidates(out, lower.replace(/ían$/, "er"), lower.replace(/ían$/, "ir"));
  }
  if (/ía$/.test(lower)) {
    addCandidates(out, lower.replace(/ía$/, "er"), lower.replace(/ía$/, "ir"));
  }

  // 简单过去式 -aron / -ieron / -ió / -ó(ar)
  if (/aron$/.test(lower)) addCandidates(out, lower.replace(/aron$/, "ar"));
  if (/ieron$/.test(lower)) {
    const stem = lower.slice(0, -5);
    const mapped = lookupPreteriteStem(stem);
    if (mapped) addCandidates(out, mapped);
    const defaultLemma = defaultLemmaFromPreteriteStem(stem);
    if (defaultLemma) addCandidates(out, defaultLemma);
    addCandidates(out, `${stem}er`, `${stem}ir`);
  }
  if (/ió$/.test(lower)) {
    const stem = lower.slice(0, -2);
    const mapped = lookupPreteriteStem(stem);
    if (mapped) addCandidates(out, mapped);
    const defaultLemma = defaultLemmaFromPreteriteStem(stem);
    if (defaultLemma) addCandidates(out, defaultLemma);
    addCandidates(out, `${stem}er`, `${stem}ir`);
  }
  // -ar 简单过去式：pasó → pasar（排除 -ió/-yó 等）
  if (/[^aeiouyí]ó$/.test(lower) && lower.length > 3 && !/ión$/.test(lower)) {
    addCandidates(out, `${lower.slice(0, -1)}ar`);
  }

  // 现在式/祈使等 -o / -as / -a / -an / -es / -e
  if (/o$/.test(lower) && lower.length > 3 && !/ió$/.test(lower)) {
    const stem = lower.slice(0, -1);
    addCandidates(out, `${stem}ar`, `${stem}er`, `${stem}ir`);
  }
  if (/an$/.test(lower) && lower.length > 4) {
    const stem = lower.slice(0, -2);
    addCandidates(out, `${stem}ar`, `${stem}er`, `${stem}ir`);
  }
  if (/en$/.test(lower) && lower.length > 4) {
    const stem = lower.slice(0, -2);
    addCandidates(out, `${stem}er`, `${stem}ir`);
  }

  // 将来/条件式
  if (/arán$/.test(lower)) addCandidates(out, lower.replace(/arán$/, "ar"));
  if (/ará$/.test(lower)) addCandidates(out, lower.replace(/ará$/, "ar"));
  if (/aré$/.test(lower)) addCandidates(out, lower.replace(/aré$/, "ar"));
  if (/erán$/.test(lower)) addCandidates(out, lower.replace(/erán$/, "er"));
  if (/erá$/.test(lower)) addCandidates(out, lower.replace(/erá$/, "er"));
  if (/eré$/.test(lower)) addCandidates(out, lower.replace(/eré$/, "er"));
  if (/irán$/.test(lower)) addCandidates(out, lower.replace(/irán$/, "ir"));
  if (/irá$/.test(lower)) addCandidates(out, lower.replace(/irá$/, "ir"));

  // 分词/副动词
  if (/ando$/.test(lower)) addCandidates(out, lower.replace(/ando$/, "ar"));
  if (/iendo$/.test(lower)) {
    const stem = lower.slice(0, -6);
    const mapped = lookupPreteriteStem(stem);
    if (mapped) addCandidates(out, mapped);
    addCandidates(out, lower.replace(/iendo$/, "er"), lower.replace(/iendo$/, "ir"));
  }
  if (/ado$/.test(lower)) addCandidates(out, lower.replace(/ado$/, "ar"));
  if (/ido$/.test(lower)) {
    const stem = lower.slice(0, -3);
    const mapped = lookupPreteriteStem(stem);
    if (mapped) addCandidates(out, mapped);
    addCandidates(out, lower.replace(/ido$/, "er"), lower.replace(/ido$/, "ir"));
  }

  // 名词复数 → 单数（粗略，仅当不像动词变位）
  if (
    !/(?:ió|ieron|aba|aban|ía|ían|ando|iendo|ado|ido)$/.test(lower) &&
    /es$/.test(lower) &&
    lower.length > 4
  ) {
    const singular = lower.slice(0, -2);
    if (singular.length >= 3) out.add(singular);
  }
  if (
    !/(?:ió|ieron|aba|aban|ía|ían|ando|iendo|ado|ido|[aeiouy]s)$/.test(lower) &&
    /s$/.test(lower) &&
    lower.length > 3
  ) {
    const singular = lower.slice(0, -1);
    if (singular.length >= 3) out.add(singular);
  }

  return [...out];
}

function scoreCandidate(lower: string, candidate: string): number {
  if (!isInfinitiveForm(candidate)) return -100;

  let score = 10;

  if (IRREGULAR[lower] === candidate) score += 100;
  if (Object.values(PRETERITE_STEM_LEMMA).includes(candidate)) score += 50;

  // 变位后缀与原形词尾一致；-er/-ir 默认优先 -er，词干映射命中时另加权重
  const stemMapped =
    (/ió$/.test(lower) && lookupPreteriteStem(lower.slice(0, -2))) ||
    (/ieron$/.test(lower) && lookupPreteriteStem(lower.slice(0, -5)));
  if (/ió$|ieron$|ía$|ían$|iendo$|ido$/.test(lower)) {
    if (candidate.endsWith("er")) score += 12;
    if (candidate.endsWith("ir")) score += stemMapped === candidate ? 14 : 9;
  }
  if (/aba$|aban$|ando$|ado$|[^i]ó$/.test(lower) && candidate.endsWith("ar")) {
    score += 12;
  }

  // 惩罚机械拼接但不符合 o→u / e→i 变位的错误原形（如 mur → murer）
  if (/^mur(?:er|ir|ar)$/.test(candidate)) score -= 80;
  if (/^dur(?:er|ar)$/.test(candidate)) score -= 80;
  if (/^pid(?:er|ar)$/.test(candidate)) score -= 80;

  score -= candidate.length * 0.05;
  return score;
}

function pickBestLemma(surface: string, candidates: string[]): string {
  const lower = normalizeSpanishToken(surface);
  if (IRREGULAR[lower]) return IRREGULAR[lower];

  if (/ió$/.test(lower)) {
    const mapped = lookupPreteriteStem(lower.slice(0, -2));
    if (mapped) return mapped;
    const defaultLemma = defaultLemmaFromPreteriteStem(lower.slice(0, -2));
    if (defaultLemma) return defaultLemma;
  }
  if (/ieron$/.test(lower)) {
    const mapped = lookupPreteriteStem(lower.slice(0, -5));
    if (mapped) return mapped;
    const defaultLemma = defaultLemmaFromPreteriteStem(lower.slice(0, -5));
    if (defaultLemma) return defaultLemma;
  }

  const ranked = candidates
    .filter((c) => c && c !== lower)
    .map((c) => ({ c, score: scoreCandidate(lower, c) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.c ?? lower;
}

/** 同步：字幕词 → 最可能的西班牙语原形 */
export function guessSpanishLemma(surface: string): string {
  const lower = normalizeSpanishToken(surface);
  if (!lower) return surface.trim();
  if (IRREGULAR[lower]) return IRREGULAR[lower];

  const nounLemma = guessSpanishNounLemma(lower);
  if (nounLemma) return nounLemma;

  if (isInfinitiveForm(lower)) return lower;

  const candidates = regularInfinitiveCandidates(lower);
  return pickBestLemma(surface, candidates);
}

export function resolveSpanishLemma(surface: string): {
  lemma: string;
  surface: string;
} {
  const raw = surface.trim();
  const lemma = guessSpanishLemma(raw);
  return { lemma, surface: raw };
}
