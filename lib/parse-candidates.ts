export type CandidateInput = { name: string; email: string };

const EMAIL_RE = /[^\s,;<>()"']+@[^\s,;<>()"']+\.[^\s,;<>()"']+/g;

/**
 * Convierte texto libre en candidatos. Acepta correos solos o con nombre, separados por
 * comas, punto y coma o saltos de línea:
 *   "Ana Pérez, ana@x.com, Luis Gómez <luis@x.com>"
 *   "ana@x.com, luis@x.com"
 * El nombre es el texto que precede a cada correo; si falta, se usa la parte local del correo.
 */
export function parseCandidates(raw: string): CandidateInput[] {
  const out: CandidateInput[] = [];
  const seen = new Set<string>();
  let cursor = 0;

  for (const m of raw.matchAll(EMAIL_RE)) {
    const email = m[0].toLowerCase();
    const before = raw.slice(cursor, m.index);
    cursor = (m.index ?? 0) + m[0].length;

    const name = before
      .replace(/[<>"]/g, " ")
      .replace(/^[\s,;]+|[\s,;]+$/g, "")
      .replace(/\s+/g, " ");

    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ name: name || email.split("@")[0], email });
  }
  return out;
}
