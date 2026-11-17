/** Nombres de columna aceptados en el CSV de examen (sin acentos, mayúsculas ni espacios) → nombre canónico. */
const ALIASES: Record<string, string> = {
  pregunta: "Pregunta", enunciado: "Pregunta",
  tipo: "Tipo",
  opciona: "OpcionA", opcion1: "OpcionA", a: "OpcionA",
  opcionb: "OpcionB", opcion2: "OpcionB", b: "OpcionB",
  opcionc: "OpcionC", opcion3: "OpcionC", c: "OpcionC",
  opciond: "OpcionD", opcion4: "OpcionD", d: "OpcionD",
  correcta: "Correcta", respuestacorrecta: "Correcta", respuesta: "Correcta",
  puntos: "Puntos", puntaje: "Puntos",
  imagenurl: "ImagenUrl", imagen: "ImagenUrl",
};

export function canonicalHeader(h: string): string {
  const key = h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ALIASES[key] ?? h.trim();
}

/** Interpreta «Correcta»: letra A–D, número 1–4 o el texto exacto de la opción. Devuelve el índice 0–3 o -1. */
export function correctIndex(correct: string, optionTexts: string[]): number {
  const c = correct.trim();
  if (!c) return -1;
  if (c.length === 1) {
    const byLetter = "ABCD".indexOf(c.toUpperCase());
    if (byLetter >= 0) return optionTexts[byLetter] ? byLetter : -1;
    const n = Number(c);
    if (n >= 1 && n <= 4) return optionTexts[n - 1] ? n - 1 : -1;
  }
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const hits = optionTexts.map((t, i) => (t && norm(t) === norm(c) ? i : -1)).filter((i) => i >= 0);
  return hits.length === 1 ? hits[0] : -1;
}
