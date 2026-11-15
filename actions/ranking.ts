"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hasPermission, UNAUTHORIZED } from "@/lib/require-admin";
import { computeRanking, type RankInput, type RankMethod } from "@/lib/ranking";

type Decision = "SELECTED" | "WAITLIST" | "NOT_SELECTED";
const METHODS: RankMethod[] = ["raw", "difficulty", "integrity"];

export type RankingExam = {
  id: string;
  title: string;
  durationMinutes: number;
  convocatoriaId: string | null;
  convocatoria: string | null;
  year: number | null;
  entregados: number;
};

/** Exámenes que ya tienen entregas (los únicos que se pueden rankear). */
export async function listRankingExams(): Promise<RankingExam[]> {
  if (!(await hasPermission("ranking:view"))) return [];
  const [exams, groups] = await Promise.all([
    prisma.exam.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, durationMinutes: true, convocatoriaId: true, convocatoria: { select: { name: true, year: true } } },
    }),
    prisma.candidateSession.groupBy({ by: ["examId"], where: { status: "SUBMITTED" }, _count: { _all: true } }),
  ]);
  const sub = new Map(groups.map((g) => [g.examId, g._count._all]));
  return exams
    .filter((e) => (sub.get(e.id) ?? 0) > 0)
    .map((e) => ({
      id: e.id, title: e.title, durationMinutes: e.durationMinutes, convocatoriaId: e.convocatoriaId,
      convocatoria: e.convocatoria?.name ?? null, year: e.convocatoria?.year ?? null, entregados: sub.get(e.id) ?? 0,
    }));
}

/** Carga datos y calcula el ranking. Se reutiliza en la pantalla, la preselección y los informes PDF/CSV. */
export async function loadRanking(examId: string, method: RankMethod) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true, title: true, durationMinutes: true,
      convocatoria: { select: { name: true, year: true } },
      questions: { orderBy: { position: "asc" }, select: { id: true, text: true, type: true, points: true, options: { select: { id: true, isCorrect: true } } } },
    },
  });
  if (!exam) return null;
  const sessions = await prisma.candidateSession.findMany({
    where: { examId, status: { in: ["SUBMITTED", "TERMINATED"] } },
    select: {
      id: true, status: true, flagCount: true, startedAt: true, submittedAt: true, decision: true,
      candidate: { select: { fullName: true, email: true } },
      answers: { select: { questionId: true, selectedOptionId: true } },
    },
  });
  const correctOpt = new Map(exam.questions.flatMap((q) => q.options.filter((o) => o.isCorrect).map((o) => [q.id, o.id] as const)));
  const inputs: RankInput[] = sessions.map((s) => ({
    sessionId: s.id,
    name: s.candidate.fullName,
    email: s.candidate.email,
    status: s.status as "SUBMITTED" | "TERMINATED",
    flagCount: s.flagCount,
    startedAt: s.startedAt,
    submittedAt: s.submittedAt,
    decision: s.decision,
    correct: Object.fromEntries(s.answers.map((a) => [a.questionId, !!a.selectedOptionId && correctOpt.get(a.questionId) === a.selectedOptionId])),
  }));
  const result = computeRanking(inputs, exam.questions.map((q) => ({ id: q.id, text: q.text, points: q.points, type: q.type })), exam.durationMinutes, method);
  return { exam: { id: exam.id, title: exam.title, durationMinutes: exam.durationMinutes, convocatoria: exam.convocatoria }, result };
}

export async function getRanking(examId: string, method: RankMethod) {
  if (!(await hasPermission("ranking:view"))) return null;
  return loadRanking(examId, METHODS.includes(method) ? method : "integrity");
}

type Res = { ok: true } | { ok: false; error: string };

export async function setDecision(sessionId: string, decision: Decision | null): Promise<Res> {
  if (!(await hasPermission("ranking:decide"))) return { ok: false, error: UNAUTHORIZED };
  if (decision !== null && !["SELECTED", "WAITLIST", "NOT_SELECTED"].includes(decision)) return { ok: false, error: "Decisión inválida." };
  try {
    await prisma.candidateSession.update({ where: { id: sessionId }, data: { decision, decidedAt: decision ? new Date() : null } });
    revalidatePath("/admin/ranking");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar la decisión." };
  }
}

/** Marca como SELECCIONADOS a los primeros N, LISTA DE ESPERA a los siguientes W y NO SELECCIONADOS al resto clasificado. */
export async function applyShortlist(examId: string, method: RankMethod, selected: number, waitlist: number): Promise<Res> {
  if (!(await hasPermission("ranking:decide"))) return { ok: false, error: UNAUTHORIZED };
  const n = Math.floor(selected), w = Math.floor(waitlist);
  if (!Number.isFinite(n) || n < 1 || !Number.isFinite(w) || w < 0) return { ok: false, error: "Indica cuántos seleccionar (mínimo 1)." };
  try {
    const data = await loadRanking(examId, METHODS.includes(method) ? method : "integrity");
    if (!data) return { ok: false, error: "El examen no existe." };
    const ids = data.result.rows.map((r) => r.sessionId);
    if (n > ids.length) return { ok: false, error: `Solo hay ${ids.length} candidatos clasificados.` };
    const now = new Date();
    await prisma.$transaction([
      prisma.candidateSession.updateMany({ where: { id: { in: ids.slice(0, n) } }, data: { decision: "SELECTED", decidedAt: now } }),
      prisma.candidateSession.updateMany({ where: { id: { in: ids.slice(n, n + w) } }, data: { decision: "WAITLIST", decidedAt: now } }),
      prisma.candidateSession.updateMany({ where: { id: { in: ids.slice(n + w) } }, data: { decision: "NOT_SELECTED", decidedAt: now } }),
    ]);
    revalidatePath("/admin/ranking");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo aplicar la preselección." };
  }
}
