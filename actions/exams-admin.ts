"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hasPermission, UNAUTHORIZED } from "@/lib/require-admin";
import { prepareQuestions } from "@/lib/exam-prepare";
import type { ManualQuestionInput } from "@/actions/exam";

type Result = { ok: true } | { ok: false; error: string };
const refresh = () => ["/admin/exams", "/admin/exam-builder", "/admin/sessions", "/admin/dashboard"].forEach((p) => revalidatePath(p));

export type ExamListRow = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  durationMinutes: number;
  convocatoria: string | null;
  questions: number;
  points: number;
  sessions: number;
  started: number;
  shuffleQuestions: boolean;
  createdAt: Date;
};

export async function listExams(): Promise<ExamListRow[]> {
  if (!(await hasPermission("exams:write"))) return [];
  const [exams, pts, groups] = await Promise.all([
    prisma.exam.findMany({
      orderBy: { createdAt: "desc" },
      include: { convocatoria: { select: { name: true, year: true } }, _count: { select: { questions: true } } },
    }),
    prisma.question.groupBy({ by: ["examId"], _sum: { points: true } }),
    prisma.candidateSession.groupBy({ by: ["examId", "status"], _count: { _all: true } }),
  ]);
  const points = new Map(pts.map((p) => [p.examId, p._sum.points ?? 0]));
  return exams.map((e) => {
    const mine = groups.filter((g) => g.examId === e.id);
    return {
      id: e.id, title: e.title, status: e.status, durationMinutes: e.durationMinutes,
      convocatoria: e.convocatoria ? `${e.convocatoria.name}` : null,
      questions: e._count.questions, points: points.get(e.id) ?? 0,
      sessions: mine.reduce((n, g) => n + g._count._all, 0),
      started: mine.filter((g) => g.status !== "NOT_STARTED").reduce((n, g) => n + g._count._all, 0),
      shuffleQuestions: e.shuffleQuestions, createdAt: e.createdAt,
    };
  });
}

export type ExamForEdit = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  convocatoriaId: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  /** true si ya hay candidatos que iniciaron: las preguntas no se pueden tocar sin falsear el histórico. */
  locked: boolean;
  questions: { text: string; type: "MULTIPLE_CHOICE" | "TEXT"; points: number; imageUrl: string; options: { text: string; isCorrect: boolean }[] }[];
};

export async function getExamForEdit(examId: string): Promise<ExamForEdit | null> {
  if (!(await hasPermission("exams:write"))) return null;
  const e = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      questions: { orderBy: { position: "asc" }, include: { options: { orderBy: { position: "asc" } } } },
      _count: { select: { sessions: { where: { status: { not: "NOT_STARTED" } } } } },
    },
  });
  if (!e) return null;
  return {
    id: e.id, title: e.title, description: e.description ?? "", durationMinutes: e.durationMinutes,
    convocatoriaId: e.convocatoriaId ?? "", shuffleQuestions: e.shuffleQuestions, shuffleOptions: e.shuffleOptions,
    status: e.status, locked: e._count.sessions > 0,
    questions: e.questions.map((q) => ({
      text: q.text, type: q.type, points: q.points, imageUrl: q.imageUrl ?? "",
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
    })),
  };
}

export type UpdateExamInput = {
  title: string;
  description?: string;
  durationMinutes: number;
  convocatoriaId: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  /** Solo se aplica si el examen no está bloqueado. */
  questions?: ManualQuestionInput[];
};

export async function updateExam(examId: string, input: UpdateExamInput): Promise<Result> {
  if (!(await hasPermission("exams:write"))) return { ok: false, error: UNAUTHORIZED };
  if (!input.title?.trim()) return { ok: false, error: "El título del examen es obligatorio." };
  if (!Number.isFinite(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 600)
    return { ok: false, error: "La duración debe estar entre 1 y 600 minutos." };
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { convocatoriaId: true, _count: { select: { sessions: { where: { status: { not: "NOT_STARTED" } } } } } },
    });
    if (!exam) return { ok: false, error: "El examen no existe." };
    const locked = exam._count.sessions > 0;

    if (input.convocatoriaId !== exam.convocatoriaId) {
      if (locked) return { ok: false, error: "No puedes cambiar la convocatoria: ya hay candidatos que iniciaron este examen." };
      const c = await prisma.convocatoria.findUnique({ where: { id: input.convocatoriaId }, select: { status: true } });
      if (!c || c.status !== "ACTIVE") return { ok: false, error: "La convocatoria no existe o está archivada." };
    }

    const meta = {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      durationMinutes: Math.floor(input.durationMinutes),
      convocatoriaId: input.convocatoriaId,
      shuffleQuestions: input.shuffleQuestions,
      shuffleOptions: input.shuffleOptions,
    };

    if (locked || !input.questions) {
      await prisma.exam.update({ where: { id: examId }, data: meta });
    } else {
      const prepared = prepareQuestions(input.questions);
      if (!prepared.ok) return prepared;
      await prisma.$transaction(async (tx) => {
        await tx.exam.update({ where: { id: examId }, data: meta });
        await tx.question.deleteMany({ where: { examId } }); // opciones/respuestas en cascada (nadie ha iniciado)
        await tx.question.createMany({ data: prepared.questions.map((q) => ({ ...q, examId })) });
        if (prepared.options.length) await tx.option.createMany({ data: prepared.options });
      });
    }
    refresh();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar el examen." };
  }
}

/** Copia el examen (preguntas y opciones) como BORRADOR, opcionalmente en otra convocatoria (p. ej. la del año siguiente). */
export async function duplicateExam(examId: string, convocatoriaId?: string): Promise<Result & { newId?: string }> {
  if (!(await hasPermission("exams:write"))) return { ok: false, error: UNAUTHORIZED };
  try {
    const src = await prisma.exam.findUnique({
      where: { id: examId },
      include: { questions: { orderBy: { position: "asc" }, include: { options: { orderBy: { position: "asc" } } } } },
    });
    if (!src) return { ok: false, error: "El examen no existe." };
    const target = convocatoriaId || src.convocatoriaId;
    if (convocatoriaId) {
      const c = await prisma.convocatoria.findUnique({ where: { id: convocatoriaId }, select: { status: true } });
      if (!c || c.status !== "ACTIVE") return { ok: false, error: "La convocatoria destino no existe o está archivada." };
    }
    const created = await prisma.exam.create({
      data: {
        title: `${src.title} (copia)`, description: src.description, durationMinutes: src.durationMinutes, status: "DRAFT",
        convocatoriaId: target, shuffleQuestions: src.shuffleQuestions, shuffleOptions: src.shuffleOptions,
        questions: {
          create: src.questions.map((q) => ({
            text: q.text, type: q.type, imageUrl: q.imageUrl, position: q.position, points: q.points,
            options: { create: q.options.map((o) => ({ text: o.text, imageUrl: o.imageUrl, isCorrect: o.isCorrect, position: o.position })) },
          })),
        },
      },
      select: { id: true },
    });
    refresh();
    return { ok: true, newId: created.id };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo duplicar el examen." };
  }
}

export async function setExamStatus(examId: string, status: "DRAFT" | "PUBLISHED" | "CLOSED"): Promise<Result> {
  if (!(await hasPermission("exams:write"))) return { ok: false, error: UNAUTHORIZED };
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { status: true, _count: { select: { questions: true, sessions: { where: { status: { not: "NOT_STARTED" } } } } } },
    });
    if (!exam) return { ok: false, error: "El examen no existe." };
    if (status === "PUBLISHED" && exam._count.questions === 0) return { ok: false, error: "El examen no tiene preguntas." };
    if (status === "DRAFT" && exam._count.sessions > 0) return { ok: false, error: "No se puede volver a borrador: ya hay candidatos que lo iniciaron. Ciérralo en su lugar." };
    await prisma.exam.update({ where: { id: examId }, data: { status } });
    refresh();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo cambiar el estado." };
  }
}

/** Solo se elimina un examen sin actividad real. Si hay candidatos que iniciaron, el histórico se conserva (usa «Cerrar»). */
export async function deleteExam(examId: string): Promise<Result> {
  if (!(await hasPermission("exams:write"))) return { ok: false, error: UNAUTHORIZED };
  try {
    const started = await prisma.candidateSession.count({ where: { examId, status: { not: "NOT_STARTED" } } });
    if (started > 0) return { ok: false, error: "Este examen ya tiene candidatos que lo iniciaron. Para conservar el histórico no se puede eliminar: ciérralo." };
    await prisma.$transaction([
      prisma.candidateSession.deleteMany({ where: { examId } }), // enlaces creados que nadie usó
      prisma.exam.delete({ where: { id: examId } }),
    ]);
    refresh();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo eliminar el examen." };
  }
}
