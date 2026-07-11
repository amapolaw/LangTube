/**
 * 精简 CEFR 核心词表（A1–B2），用于英语/西语等级甄别。
 * 可被 data/reference/en-cefr-levels.json / es-cefr-levels.json 覆盖扩展。
 */
export const EN_CEFR_SEED: Record<string, string> = {
  // A1
  i: "A1", you: "A1", he: "A1", she: "A1", we: "A1", they: "A1",
  be: "A1", have: "A1", do: "A1", go: "A1", come: "A1", see: "A1",
  want: "A1", like: "A1", need: "A1", know: "A1", think: "A1",
  good: "A1", bad: "A1", big: "A1", small: "A1", new: "A1", old: "A1",
  time: "A1", day: "A1", year: "A1", people: "A1", man: "A1", woman: "A1",
  child: "A1", family: "A1", friend: "A1", school: "A1", work: "A1",
  home: "A1", house: "A1", water: "A1", food: "A1", money: "A1",
  book: "A1", name: "A1", yes: "A1", no: "A1", please: "A1", thanks: "A1",
  hello: "A1", today: "A1", tomorrow: "A1", yesterday: "A1",
  // A2
  already: "A2", almost: "A2", always: "A2", never: "A2", often: "A2",
  sometimes: "A2", usually: "A2", enough: "A2", during: "A2",
  because: "A2", although: "A2", however: "A2", instead: "A2",
  decide: "A2", explain: "A2", describe: "A2", prefer: "A2",
  agree: "A2", disagree: "A2", improve: "A2", prepare: "A2",
  problem: "A2", reason: "A2", result: "A2", example: "A2",
  experience: "A2", information: "A2", opportunity: "A2",
  important: "A2", different: "A2", possible: "A2", available: "A2",
  // B1
  achieve: "B1", analyze: "B1", assume: "B1", benefit: "B1",
  challenge: "B1", conclude: "B1", consider: "B1", contribute: "B1",
  demonstrate: "B1", emphasize: "B1", establish: "B1", evaluate: "B1",
  evidence: "B1", factor: "B1", feature: "B1", impact: "B1",
  indicate: "B1", maintain: "B1", obtain: "B1", participate: "B1",
  perspective: "B1", significant: "B1", strategy: "B1",
  // B2
  accommodate: "B2", acknowledge: "B2", advocate: "B2", arbitrary: "B2",
  coherent: "B2", comprehensive: "B2", controversy: "B2",
  crucial: "B2", elaborate: "B2", facilitate: "B2", hypothesis: "B2",
  inevitable: "B2", manipulate: "B2", nevertheless: "B2",
  paradigm: "B2", phenomenon: "B2", substantial: "B2",
};

export const ES_CEFR_SEED: Record<string, string> = {
  yo: "A1", tú: "A1", el: "A1", ella: "A1", nosotros: "A1",
  ser: "A1", estar: "A1", tener: "A1", hacer: "A1", ir: "A1",
  venir: "A1", ver: "A1", querer: "A1", poder: "A1", saber: "A1",
  bueno: "A1", malo: "A1", grande: "A1", pequeño: "A1",
  casa: "A1", familia: "A1", amigo: "A1", escuela: "A1", trabajo: "A1",
  agua: "A1", comida: "A1", tiempo: "A1", día: "A1", hoy: "A1",
  mañana: "A1", ayer: "A1", sí: "A1", no: "A1", gracias: "A1",
  hola: "A1", por: "A1", para: "A1", con: "A1", sin: "A1",
  siempre: "A2", nunca: "A2", también: "A2", todavía: "A2",
  porque: "A2", aunque: "A2", entonces: "A2", después: "A2",
  antes: "A2", durante: "A2", problema: "A2", razón: "A2",
  importante: "A2", diferente: "A2", posible: "A2",
  decidir: "A2", explicar: "A2", preferir: "A2", mejorar: "A2",
  experiencia: "B1", información: "B1", oportunidad: "B1",
  resultado: "B1", ejemplo: "B1", considerar: "B1", analizar: "B1",
  demostrar: "B1", establecer: "B1", participar: "B1",
  significativo: "B1", estrategia: "B1", impacto: "B1",
  sinembargo: "B1", además: "B1", mientras: "B1",
  crucial: "B2", evidencia: "B2", hipótesis: "B2",
  fenómeno: "B2", sustancial: "B2", inevitable: "B2",
  facilitar: "B2", reconocer: "B2",
};
