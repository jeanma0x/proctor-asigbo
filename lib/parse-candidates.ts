export type CandidateInput = { name: string; email: string };

const EMAIL_RE = /[^\s,;<>()"'\t]+@[^\s,;<>()"'\t]+\.[^\s,;<>()"'\t]+/g;

const cleanName = (s: string) =>
  s
    .replace(/[<>"';\t]/g, " ")
    .replace(/^[\s,;:|-]+|[\s,;:|-]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);

/**
 * Convierte texto libre (escrito, pegado desde Excel/Sheets o leído de un CSV) en candidatos.
 * Línea por línea:
 *  - un correo en la línea → el resto de la línea es el nombre (antes o después del correo, con comas o tabs):
 *      "Ana Pérez\tana@x.com"  ·  "ana@x.com,Ana Pérez"  ·  "Luis Gómez <luis@x.com>"
 *  - varios correos en la línea → lista: el texto previo a cada correo es su nombre.
 *  - sin correo (p. ej. la fila de encabezados) → se ignora.
 * Sin nombre se usa la parte local del correo. Se deduplica por correo.
 */
export function parseCandidates(raw: string): CandidateInput[] {
  const out: CandidateInput[] = [];
  const seen = new Set<string>();
  const push = (email: string, name: string) => {
    const e = email.toLowerCase();
    if (seen.has(e)) return;
    seen.add(e);
    out.push({ email: e, name: name || e.split("@")[0] });
  };

  for (const line of raw.split(/\r?\n/)) {
    const emails = [...line.matchAll(EMAIL_RE)];
    if (emails.length === 0) continue;
    if (emails.length === 1) {
      const m = emails[0];
      push(m[0], cleanName(line.replace(m[0], " ")));
      continue;
    }
    let cursor = 0;
    for (const m of emails) {
      push(m[0], cleanName(line.slice(cursor, m.index)));
      cursor = (m.index ?? 0) + m[0].length;
    }
  }
  return out;
}
