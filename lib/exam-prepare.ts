import { randomUUID } from "crypto";
import type { ManualQuestionInput } from "@/actions/exam";

export type PreparedQuestion = {
  id: string;
  text: string;
  type: "MULTIPLE_CHOICE" | "TEXT";
  points: number;
  imageUrl: string | null;
  position: number;
  section: string | null;
  sectionNote: string | null;
  passage: string | null;
};
export type PreparedOption = { questionId: string; text: string; isCorrect: boolean; position: number };

export function cleanUrl(url?: string): string | null {
  const u = url?.trim();
  if (!u) return null;
  if (u.startsWith("/") && !u.startsWith("//")) return u.slice(0, 300); // imagen del propio sitio (carpeta public)
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

export function sectionFields(q: { section?: string | null; sectionNote?: string | null; passage?: string | null }) {
  const c = (v?: string | null, n = 20000) => v?.trim().slice(0, n) || null;
  return { section: c(q.section, 200), sectionNote: c(q.sectionNote, 2000), passage: c(q.passage) };
}

/** Valida y normaliza las preguntas del editor manual. Devuelve el mensaje de error o las filas listas para createMany. */
export function prepareQuestions(
  input: ManualQuestionInput[],
): { ok: true; questions: PreparedQuestion[]; options: PreparedOption[] } | { ok: false; error: string } {
  if (!input?.length) return { ok: false, error: "Agrega al menos una pregunta." };
  const questions: PreparedQuestion[] = [];
  const options: PreparedOption[] = [];
  for (const [i, q] of input.entries()) {
    const n = i + 1;
    if (!q.text?.trim()) return { ok: false, error: `Pregunta ${n}: el enunciado está vacío.` };
    if (q.imageUrl?.trim() && !cleanUrl(q.imageUrl)) return { ok: false, error: `Pregunta ${n}: la URL de imagen no es válida (http/https).` };
    const id = randomUUID();
    questions.push({ id, text: q.text.trim(), type: q.type, points: Math.max(1, Math.floor(q.points) || 1), imageUrl: cleanUrl(q.imageUrl), position: i, ...sectionFields(q) });
    if (q.type === "MULTIPLE_CHOICE") {
      const opts = q.options.filter((o) => o.text.trim());
      if (opts.length < 2) return { ok: false, error: `Pregunta ${n}: se requieren al menos 2 opciones.` };
      if (opts.filter((o) => o.isCorrect).length !== 1) return { ok: false, error: `Pregunta ${n}: marca exactamente una opción correcta.` };
      opts.forEach((o, j) => options.push({ questionId: id, text: o.text.trim(), isCorrect: o.isCorrect, position: j }));
    }
  }
  return { ok: true, questions, options };
}
