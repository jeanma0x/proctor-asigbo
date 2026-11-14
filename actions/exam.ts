"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export type QuestionTypeInput = "MULTIPLE_CHOICE" | "TEXT";

export type ManualQuestionInput = {
  text: string;
  type: QuestionTypeInput;
  points: number;
  imageUrl?: string;
  options: { text: string; isCorrect: boolean }[];
};

export type CreateExamInput = {
  title: string;
  description?: string;
  durationMinutes: number;
  questions: ManualQuestionInput[];
};

export type CsvRow = Record<string, string | undefined>;

export type ActionResult =
  | { ok: true; examId: string; questionCount: number }
  | { ok: false; error: string };

type PreparedQuestion = {
  id: string;
  text: string;
  type: QuestionTypeInput;
  points: number;
  imageUrl: string | null;
  position: number;
};
type PreparedOption = {
  questionId: string;
  text: string;
  isCorrect: boolean;
  position: number;
};

/** Crea el examen + preguntas + opciones con createMany en una sola transacción. */
async function persistExam(
  meta: { title: string; description?: string; durationMinutes: number },
  questions: PreparedQuestion[],
  options: PreparedOption[],
): Promise<ActionResult> {
  const exam = await prisma.$transaction(async (tx) => {
    const created = await tx.exam.create({
      data: {
        title: meta.title,
        description: meta.description || null,
        durationMinutes: meta.durationMinutes,
        status: "DRAFT",
      },
    });
    await tx.question.createMany({
      data: questions.map((q) => ({ ...q, examId: created.id })),
    });
    if (options.length > 0) {
      await tx.option.createMany({ data: options });
    }
    return created;
  });
  revalidatePath("/admin/exam-builder");
  return { ok: true, examId: exam.id, questionCount: questions.length };
}

function validMeta(title: string, durationMinutes: number): string | null {
  if (!title?.trim()) return "El título del examen es obligatorio.";
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 600)
    return "La duración debe estar entre 1 y 600 minutos.";
  return null;
}

function cleanUrl(url?: string): string | null {
  const u = url?.trim();
  if (!u) return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** Creación manual desde el formulario dinámico. */
export async function createExamManual(input: CreateExamInput): Promise<ActionResult> {
  try {
    const metaError = validMeta(input.title, input.durationMinutes);
    if (metaError) return { ok: false, error: metaError };
    if (!input.questions?.length) return { ok: false, error: "Agrega al menos una pregunta." };

    const questions: PreparedQuestion[] = [];
    const options: PreparedOption[] = [];

    for (const [i, q] of input.questions.entries()) {
      const n = i + 1;
      if (!q.text?.trim()) return { ok: false, error: `Pregunta ${n}: el enunciado está vacío.` };
      if (q.imageUrl?.trim() && !cleanUrl(q.imageUrl))
        return { ok: false, error: `Pregunta ${n}: la URL de imagen no es válida (http/https).` };

      const id = randomUUID();
      questions.push({
        id,
        text: q.text.trim(),
        type: q.type,
        points: Math.max(1, Math.floor(q.points) || 1),
        imageUrl: cleanUrl(q.imageUrl),
        position: i,
      });

      if (q.type === "MULTIPLE_CHOICE") {
        const opts = q.options.filter((o) => o.text.trim());
        if (opts.length < 2)
          return { ok: false, error: `Pregunta ${n}: se requieren al menos 2 opciones.` };
        if (opts.filter((o) => o.isCorrect).length !== 1)
          return { ok: false, error: `Pregunta ${n}: marca exactamente una opción correcta.` };
        opts.forEach((o, j) =>
          options.push({ questionId: id, text: o.text.trim(), isCorrect: o.isCorrect, position: j }),
        );
      }
    }

    return await persistExam(input, questions, options);
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Error al guardar el examen en la base de datos." };
  }
}

const OPTION_COLUMNS = ["OpcionA", "OpcionB", "OpcionC", "OpcionD"] as const;

/**
 * Importación masiva. Recibe las filas del CSV ya parseadas (papaparse en el cliente)
 * con columnas: Pregunta, Tipo, OpcionA, OpcionB, [OpcionC, OpcionD], Correcta (A/B/C/D).
 * Opcionales: Puntos, ImagenUrl.
 */
export async function importExamFromCsv(
  meta: { title: string; description?: string; durationMinutes: number },
  rows: CsvRow[],
): Promise<ActionResult> {
  try {
    const metaError = validMeta(meta.title, meta.durationMinutes);
    if (metaError) return { ok: false, error: metaError };
    if (!rows?.length) return { ok: false, error: "El CSV no contiene filas." };
    if (rows.length > 1000) return { ok: false, error: "Máximo 1000 preguntas por CSV." };

    const questions: PreparedQuestion[] = [];
    const options: PreparedOption[] = [];

    for (const [i, row] of rows.entries()) {
      const line = i + 2; // +1 encabezado, +1 base-1
      const text = row.Pregunta?.trim();
      if (!text) return { ok: false, error: `Fila ${line}: falta la columna Pregunta.` };

      const rawType = (row.Tipo ?? "").trim().toUpperCase().replace(/\s+/g, "_");
      const type: QuestionTypeInput | null =
        rawType === "TEXT" || rawType === "TEXTO"
          ? "TEXT"
          : ["MULTIPLE_CHOICE", "MULTIPLE", "OPCION_MULTIPLE", "MC"].includes(rawType)
            ? "MULTIPLE_CHOICE"
            : null;
      if (!type) return { ok: false, error: `Fila ${line}: Tipo inválido ("${row.Tipo}"). Usa MULTIPLE_CHOICE o TEXT.` };

      const id = randomUUID();
      questions.push({
        id,
        text,
        type,
        points: Math.max(1, parseInt(row.Puntos ?? "1", 10) || 1),
        imageUrl: cleanUrl(row.ImagenUrl),
        position: i,
      });

      if (type === "MULTIPLE_CHOICE") {
        const texts = OPTION_COLUMNS.map((c) => row[c]?.trim() ?? "");
        const correct = (row.Correcta ?? "").trim().toUpperCase();
        const correctIdx = "ABCD".indexOf(correct);
        if (correct.length !== 1 || correctIdx < 0 || !texts[correctIdx])
          return { ok: false, error: `Fila ${line}: "Correcta" debe ser A, B, C o D y apuntar a una opción con texto.` };
        if (texts.filter(Boolean).length < 2)
          return { ok: false, error: `Fila ${line}: se requieren al menos 2 opciones.` };

        texts.forEach((t, j) => {
          if (t) options.push({ questionId: id, text: t, isCorrect: j === correctIdx, position: j });
        });
      }
    }

    return await persistExam(meta, questions, options);
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Error al importar el CSV." };
  }
}

/** Cambia un examen de DRAFT a PUBLISHED (requiere al menos una pregunta). */
export async function publishExam(
  examId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { status: true, _count: { select: { questions: true } } },
    });
    if (!exam) return { ok: false, error: "El examen no existe." };
    if (exam.status !== "DRAFT") return { ok: false, error: "Solo se pueden publicar exámenes en borrador." };
    if (exam._count.questions === 0) return { ok: false, error: "El examen no tiene preguntas." };

    await prisma.exam.update({ where: { id: examId }, data: { status: "PUBLISHED" } });
    revalidatePath("/admin/exam-builder");
    revalidatePath("/admin/sessions");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo publicar el examen." };
  }
}
