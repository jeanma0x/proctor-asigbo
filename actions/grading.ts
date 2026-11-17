"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAdmin, hasPermission, UNAUTHORIZED } from "@/lib/require-admin";
import { logAction } from "@/lib/audit";

type Result = { ok: true; score: number } | { ok: false; error: string };

/**
 * Califica manualmente una respuesta abierta (0..puntos de la pregunta, en pasos de 0.5)
 * y recalcula el puntaje de la sesión = opción múltiple + notas manuales, en una sola transacción.
 */
export async function gradeAnswer(sessionId: string, questionId: string, score: number): Promise<Result> {
  if (!(await hasPermission("results:grade"))) return { ok: false, error: UNAUTHORIZED };
  try {
    const q = await prisma.question.findFirst({
      where: { id: questionId, type: "TEXT", exam: { sessions: { some: { id: sessionId } } } },
      select: { points: true },
    });
    if (!q) return { ok: false, error: "La pregunta no es abierta o no pertenece a este examen." };
    if (!Number.isFinite(score) || score < 0 || score > q.points) return { ok: false, error: `La nota debe estar entre 0 y ${q.points}.` };
    const st = await prisma.candidateSession.findUnique({ where: { id: sessionId }, select: { status: true } });
    if (st?.status === "IN_PROGRESS" || st?.status === "NOT_STARTED") return { ok: false, error: "Solo se califica un examen ya entregado o cerrado." };
    const value = Math.round(score * 2) / 2;
    const admin = await getAdmin();

    const total = await prisma.$transaction(async (tx) => {
      const answer = await tx.answer.findUnique({ where: { sessionId_questionId: { sessionId, questionId } }, select: { id: true } });
      if (!answer) throw new Error("NO_ANSWER");
      await tx.answer.update({ where: { id: answer.id }, data: { manualScore: value, gradedAt: new Date(), gradedBy: admin?.email ?? null } });
      const answers = await tx.answer.findMany({
        where: { sessionId },
        select: { manualScore: true, question: { select: { type: true, points: true } }, selectedOption: { select: { isCorrect: true } } },
      });
      const sum = answers.reduce((a, x) => a + (x.question.type === "MULTIPLE_CHOICE" ? (x.selectedOption?.isCorrect ? x.question.points : 0) : (x.manualScore ?? 0)), 0);
      await tx.candidateSession.update({ where: { id: sessionId }, data: { score: sum } });
      return sum;
    });
    const info = await prisma.candidateSession.findUnique({ where: { id: sessionId }, select: { candidate: { select: { fullName: true } }, exam: { select: { title: true } } } });
    await logAction({ action: "grade.answer", entityType: "session", entityId: sessionId, summary: `Calificó con ${value} / ${q.points} la respuesta abierta de ${info?.candidate.fullName ?? "un candidato"} en «${info?.exam.title ?? "examen"}»` });
    ["/admin/results", "/admin/ranking", "/admin/dashboard", "/admin/candidates"].forEach((p) => revalidatePath(p));
    return { ok: true, score: total };
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ANSWER") return { ok: false, error: "El candidato no respondió esta pregunta." };
    console.error(e);
    return { ok: false, error: "No se pudo guardar la calificación." };
  }
}
