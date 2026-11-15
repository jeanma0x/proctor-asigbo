"use server";

import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/require-admin";

export type ResultFilters = {
  convocatoriaId?: string;
  examId?: string;
  status?: "SUBMITTED" | "TERMINATED" | "IN_PROGRESS" | "NOT_STARTED";
  q?: string;
};

export type ResultRow = {
  id: string;
  name: string;
  email: string;
  examId: string;
  examTitle: string;
  convocatoria: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "TERMINATED";
  score: number | null;
  maxScore: number;
  flagCount: number;
  startedAt: Date | null;
  submittedAt: Date | null;
};

const MAX_ROWS = 1000;

function where(f: ResultFilters) {
  const q = f.q?.trim();
  return {
    // Por defecto se omiten los que nunca iniciaron: no tienen resultado.
    status: f.status ?? { in: ["SUBMITTED", "TERMINATED", "IN_PROGRESS"] as ("SUBMITTED" | "TERMINATED" | "IN_PROGRESS")[] },
    ...(f.examId ? { examId: f.examId } : {}),
    exam: f.convocatoriaId ? { convocatoriaId: f.convocatoriaId } : undefined,
    ...(q
      ? { candidate: { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } }
      : {}),
  };
}

async function fetchRows(f: ResultFilters): Promise<ResultRow[]> {
  const [sessions, maxes] = await Promise.all([
    prisma.candidateSession.findMany({
      where: where(f),
      orderBy: [{ submittedAt: "desc" }, { updatedAt: "desc" }],
      take: MAX_ROWS,
      select: {
        id: true, status: true, score: true, flagCount: true, startedAt: true, submittedAt: true,
        candidate: { select: { fullName: true, email: true } },
        exam: { select: { id: true, title: true, convocatoria: { select: { name: true } } } },
      },
    }),
    prisma.question.groupBy({ by: ["examId"], _sum: { points: true } }),
  ]);
  const maxByExam = new Map(maxes.map((m) => [m.examId, m._sum.points ?? 0]));
  return sessions.map((s) => ({
    id: s.id,
    name: s.candidate.fullName,
    email: s.candidate.email,
    examId: s.exam.id,
    examTitle: s.exam.title,
    convocatoria: s.exam.convocatoria?.name ?? null,
    status: s.status,
    score: s.score,
    maxScore: maxByExam.get(s.exam.id) ?? 0,
    flagCount: s.flagCount,
    startedAt: s.startedAt,
    submittedAt: s.submittedAt,
  }));
}

/** Resultados filtrados + opciones de filtro (convocatorias y exámenes). */
export async function listResults(filters: ResultFilters) {
  if (!(await hasPermission("results:view"))) throw new Error("No autorizado");
  const [rows, convocatorias, exams] = await Promise.all([
    fetchRows(filters),
    prisma.convocatoria.findMany({ orderBy: [{ year: "desc" }, { createdAt: "desc" }], select: { id: true, name: true, year: true } }),
    prisma.exam.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, title: true, convocatoriaId: true } }),
  ]);
  return { rows, convocatorias, exams, truncated: rows.length >= MAX_ROWS };
}

const csvCell = (v: string | number | null | undefined) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita inyección de fórmulas al abrir en Excel
  return `"${s.replace(/"/g, '""')}"`;
};

const STATUS_ES = { NOT_STARTED: "Sin iniciar", IN_PROGRESS: "En examen", SUBMITTED: "Entregado", TERMINATED: "Cerrado" } as const;

/** CSV con los resultados filtrados. Solo roles con permiso de exportación. */
export async function exportResultsCsv(filters: ResultFilters): Promise<{ ok: true; csv: string; filename: string } | { ok: false; error: string }> {
  if (!(await hasPermission("results:export"))) return { ok: false, error: "Tu rol no puede exportar resultados." };
  const rows = await fetchRows(filters);
  const head = ["Convocatoria", "Examen", "Nombre", "Correo", "Estado", "Puntaje", "Puntaje máximo", "Porcentaje", "Infracciones", "Inicio", "Entrega", "Duración (min)"];
  const lines = rows.map((r) => {
    const mins = r.startedAt && r.submittedAt ? Math.round((r.submittedAt.getTime() - r.startedAt.getTime()) / 60000) : "";
    const pct = r.score != null && r.maxScore ? Math.round((r.score / r.maxScore) * 100) : "";
    return [
      r.convocatoria, r.examTitle, r.name, r.email, STATUS_ES[r.status], r.score, r.maxScore, pct, r.flagCount,
      r.startedAt?.toISOString() ?? "", r.submittedAt?.toISOString() ?? "", mins,
    ].map(csvCell).join(",");
  });
  return { ok: true, csv: "﻿" + [head.map(csvCell).join(","), ...lines].join("\n"), filename: "resultados-asigbo.csv" };
}

export type QuestionResult = {
  id: string;
  number: number;
  text: string;
  type: "MULTIPLE_CHOICE" | "TEXT";
  imageUrl: string | null;
  points: number;
  earned: number;
  answered: boolean;
  correct: boolean | null; // null = no calificable automáticamente
  textResponse: string | null;
  options: { id: string; text: string; isCorrect: boolean; selected: boolean }[];
};

/** Detalle completo de una sesión: respuestas por pregunta, bitácora de eventos y datos del candidato. */
export async function getResultDetail(sessionId: string) {
  if (!(await hasPermission("results:view"))) return null;
  const s = await prisma.candidateSession.findUnique({
    where: { id: sessionId },
    include: {
      candidate: { select: { fullName: true, email: true, studentId: true } },
      exam: {
        select: {
          id: true, title: true, durationMinutes: true,
          convocatoria: { select: { id: true, name: true, year: true } },
          questions: {
            orderBy: { position: "asc" },
            select: { id: true, text: true, type: true, imageUrl: true, points: true, options: { orderBy: { position: "asc" }, select: { id: true, text: true, isCorrect: true } } },
          },
        },
      },
      answers: { select: { questionId: true, selectedOptionId: true, textResponse: true } },
      auditLogs: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, severity: true, details: true, createdAt: true } },
    },
  });
  if (!s) return null;

  const byQ = new Map(s.answers.map((a) => [a.questionId, a]));
  const questions: QuestionResult[] = s.exam.questions.map((q, i) => {
    const a = byQ.get(q.id);
    const isMc = q.type === "MULTIPLE_CHOICE";
    const chosen = a?.selectedOptionId ?? null;
    const correct = isMc ? (chosen ? !!q.options.find((o) => o.id === chosen)?.isCorrect : false) : null;
    return {
      id: q.id, number: i + 1, text: q.text, type: q.type, imageUrl: q.imageUrl, points: q.points,
      earned: correct ? q.points : 0,
      answered: isMc ? !!chosen : !!a?.textResponse?.trim(),
      correct,
      textResponse: a?.textResponse ?? null,
      options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, selected: o.id === chosen })),
    };
  });

  return {
    id: s.id,
    status: s.status,
    score: s.score,
    maxScore: questions.reduce((n, q) => n + q.points, 0),
    flagCount: s.flagCount,
    startedAt: s.startedAt,
    submittedAt: s.submittedAt,
    candidate: s.candidate,
    exam: { id: s.exam.id, title: s.exam.title, durationMinutes: s.exam.durationMinutes, convocatoria: s.exam.convocatoria },
    questions,
    hasOpenQuestions: questions.some((q) => q.type === "TEXT"),
    auditLogs: s.auditLogs,
  };
}
