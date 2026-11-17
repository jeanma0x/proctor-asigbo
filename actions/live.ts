"use server";

import { orderQuestionsForSession } from "@/lib/shuffle";
import { prisma } from "@/lib/prisma";
import { getAdmin, hasPermission, UNAUTHORIZED } from "@/lib/require-admin";
import { MAX_STRIKES } from "@/lib/proctor-constants";
import { logAction } from "@/lib/audit";

/** Cuántos eventos recientes se traen por sesión en curso. */
const RECENT_LOGS = 5;

const candidateSel = { select: { id: true, fullName: true, email: true, studentId: true } } as const;
const examSel = { select: { id: true, title: true, durationMinutes: true } } as const;

/**
 * Foto del estado de todas las sesiones de exámenes publicados: las que están en curso
 * (con sus últimos eventos) y las demás (sin iniciar / finalizadas) para las otras pestañas.
 */
export async function getLiveOverview() {
  if (!(await hasPermission("live:view"))) throw new Error("No autorizado");
  const since = new Date(Date.now() - 6 * 3600_000);
  const [active, others, recentClosed] = await Promise.all([
    prisma.candidateSession.findMany({
      where: { status: "IN_PROGRESS" },
      orderBy: { startedAt: "asc" },
      include: {
        candidate: candidateSel,
        exam: examSel,
        auditLogs: { orderBy: { createdAt: "desc" }, take: RECENT_LOGS },
      },
    }),
    prisma.candidateSession.findMany({
      where: { status: { in: ["NOT_STARTED", "SUBMITTED", "TERMINATED"] }, exam: { status: "PUBLISHED" } },
      orderBy: { updatedAt: "desc" },
      take: 300,
      include: { candidate: candidateSel, exam: examSel },
    }),
    // Cerradas por infracciones en las últimas horas: se traen sus eventos para poder alertar y justificar el cierre.
    prisma.candidateSession.findMany({
      where: { status: "TERMINATED", exam: { status: "PUBLISHED" }, updatedAt: { gte: since } },
      select: { id: true, auditLogs: { orderBy: { createdAt: "desc" }, take: 12 } },
    }),
  ]);
  const logsById = new Map(recentClosed.map((s) => [s.id, s.auditLogs]));
  return [...active, ...others.map((s) => ({ ...s, auditLogs: (logsById.get(s.id) ?? []) as typeof active[number]["auditLogs"] }))];
}

export type LiveSession = Awaited<ReturnType<typeof getLiveOverview>>[number];

/** Historial completo de eventos de una sesión (para el panel expandible). */
export async function getSessionLogs(sessionId: string) {
  if (!(await hasPermission("live:view"))) throw new Error("No autorizado");
  return prisma.auditLog.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, type: true, severity: true, details: true, createdAt: true },
  });
}

/** Cierra manualmente una sesión en curso (por decisión de la Junta). */
export async function terminateSession(sessionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await hasPermission("live:terminate"))) return { ok: false, error: UNAUTHORIZED };
  try {
    const res = await prisma.candidateSession.updateMany({
      where: { id: sessionId, status: "IN_PROGRESS" },
      data: { status: "TERMINATED", submittedAt: new Date() },
    });
    if (res.count === 0) return { ok: false, error: "La sesión ya no está en curso." };
    await prisma.auditLog.create({
      data: { sessionId, type: "OTHER", severity: "CRITICAL", details: "Sesión cerrada manualmente por la Junta" },
    });
    const who = await prisma.candidateSession.findUnique({ where: { id: sessionId }, select: { candidate: { select: { fullName: true } }, exam: { select: { title: true } } } });
    await logAction({ action: "session.terminate", entityType: "session", entityId: sessionId, summary: `Cerró manualmente el examen de ${who?.candidate.fullName ?? "un candidato"} en «${who?.exam.title ?? "examen"}»` });
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo cerrar la sesión." };
  }
}

/** Detalle completo de una sesión para el panel de infracciones y el acta (eventos en orden cronológico). */
export async function getSessionDetail(sessionId: string) {
  if (!(await hasPermission("live:view"))) throw new Error("No autorizado");
  const s = await prisma.candidateSession.findUnique({
    where: { id: sessionId },
    select: {
      status: true, flagCount: true, startedAt: true, submittedAt: true, graceUntil: true, helpRequestedAt: true, helpNote: true,
      candidate: { select: { fullName: true, email: true } },
      exam: { select: { title: true, durationMinutes: true, shuffleQuestions: true, questions: { orderBy: { position: "asc" }, select: { id: true, section: true } } } },
      answers: { select: { questionId: true } },
      auditLogs: { orderBy: { createdAt: "asc" }, take: 300, select: { id: true, type: true, severity: true, details: true, createdAt: true, voidedAt: true, voidedBy: true, voidReason: true } },
    },
  });
  if (!s) return null;
  // Avance: solo "respondida o no" (nunca la opción elegida), en el mismo orden que ve el candidato.
  const answered = new Set(s.answers.map((a) => a.questionId));
  const ordered = orderQuestionsForSession(s.exam.questions, sessionId, s.exam.shuffleQuestions);
  const progress = { cells: ordered.map((q) => answered.has(q.id)), answered: ordered.filter((q) => answered.has(q.id)).length, total: ordered.length };
  const { answers: _a, ...rest } = s;
  void _a;
  return { ...rest, exam: { title: s.exam.title, durationMinutes: s.exam.durationMinutes }, progress };
}

type Res = { ok: true } | { ok: false; error: string };
const GRACE_MINUTES = 2;

/** La Junta atiende la solicitud de ayuda (por ejemplo resolviéndola por el micrófono). */
export async function attendHelp(sessionId: string): Promise<Res> {
  if (!(await hasPermission("live:terminate"))) return { ok: false, error: UNAUTHORIZED };
  try {
    const s = await prisma.candidateSession.findUnique({ where: { id: sessionId }, select: { helpRequestedAt: true, candidate: { select: { fullName: true } } } });
    if (!s?.helpRequestedAt) return { ok: false, error: "No hay una solicitud pendiente." };
    await prisma.$transaction([
      prisma.candidateSession.update({ where: { id: sessionId }, data: { helpRequestedAt: null, helpNote: null } }),
      prisma.auditLog.create({ data: { sessionId, type: "HELP_ATTENDED", severity: "INFO", details: "La Junta atendió la solicitud de ayuda" } }),
    ]);
    await logAction({ action: "live.help_attended", entityType: "session", entityId: sessionId, summary: `Atendió la solicitud de ayuda de ${s.candidate.fullName}` });
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo marcar como atendida." };
  }
}

/** Autoriza una salida breve: durante unos minutos salir de la ventana (p. ej. a Zoom) no cuenta como infracción. */
export async function grantLeave(sessionId: string): Promise<Res & { until?: string }> {
  if (!(await hasPermission("live:terminate"))) return { ok: false, error: UNAUTHORIZED };
  try {
    const s = await prisma.candidateSession.findUnique({ where: { id: sessionId }, select: { status: true, candidate: { select: { fullName: true } } } });
    if (!s) return { ok: false, error: "La sesión no existe." };
    if (s.status !== "IN_PROGRESS") return { ok: false, error: "El examen ya no está en curso." };
    const until = new Date(Date.now() + GRACE_MINUTES * 60_000);
    await prisma.$transaction([
      prisma.candidateSession.update({ where: { id: sessionId }, data: { graceUntil: until, helpRequestedAt: null, helpNote: null } }),
      prisma.auditLog.create({ data: { sessionId, type: "GRACE_GRANTED", severity: "INFO", details: `La Junta autorizó una salida de ${GRACE_MINUTES} minutos` } }),
    ]);
    await logAction({ action: "live.grant_leave", entityType: "session", entityId: sessionId, summary: `Autorizó ${GRACE_MINUTES} minutos de salida a ${s.candidate.fullName}` });
    return { ok: true, until: until.toISOString() };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo autorizar la salida." };
  }
}

/**
 * Anula una infracción con justificación: baja el contador, conserva el evento marcado como anulado y registra quién y por qué.
 * Si el examen se había cerrado automáticamente por llegar a 3 y la anulación lo deja por debajo, solo un superadmin puede
 * reabrirlo (el reloj del servidor sigue corriendo; si ya venció el tiempo, no se puede reabrir).
 */
export async function voidInfraction(sessionId: string, logId: string, reason: string): Promise<Res & { reopened?: boolean }> {
  if (!(await hasPermission("live:terminate"))) return { ok: false, error: UNAUTHORIZED };
  const why = reason?.trim().replace(/\s+/g, " ").slice(0, 300);
  if (!why || why.length < 5) return { ok: false, error: "Escribe el motivo (mínimo 5 caracteres)." };
  const admin = await getAdmin();
  try {
    const s = await prisma.candidateSession.findUnique({
      where: { id: sessionId },
      select: { status: true, flagCount: true, startedAt: true, exam: { select: { durationMinutes: true } }, candidate: { select: { fullName: true } } },
    });
    if (!s) return { ok: false, error: "La sesión no existe." };
    const log = await prisma.auditLog.findFirst({ where: { id: logId, sessionId, type: { in: ["TAB_CHANGE", "WINDOW_BLUR", "FULLSCREEN_EXIT"] }, severity: { not: "INFO" } }, select: { id: true, voidedAt: true, type: true } });
    if (!log) return { ok: false, error: "Ese evento no es una infracción que cuente." };
    if (log.voidedAt) return { ok: false, error: "Esa infracción ya fue anulada." };

    const next = Math.max(0, s.flagCount - 1);
    const wasAutoClosed = s.status === "TERMINATED" && s.flagCount >= MAX_STRIKES;
    const reopen = wasAutoClosed && next < MAX_STRIKES;
    if (reopen) {
      if (!(await hasPermission("users:manage"))) return { ok: false, error: "El examen se cerró al llegar a 3 infracciones: solo un superadmin puede anular y reabrirlo." };
      const deadline = s.startedAt ? s.startedAt.getTime() + s.exam.durationMinutes * 60_000 : 0;
      if (!deadline || Date.now() > deadline) return { ok: false, error: "No se puede reabrir: el tiempo del examen ya terminó." };
    }
    await prisma.$transaction([
      prisma.auditLog.update({ where: { id: logId }, data: { voidedAt: new Date(), voidedBy: admin?.email ?? null, voidReason: why } }),
      prisma.candidateSession.update({ where: { id: sessionId }, data: { flagCount: next, ...(reopen ? { status: "IN_PROGRESS", submittedAt: null } : {}) } }),
      prisma.auditLog.create({ data: { sessionId, type: "STRIKE_VOIDED", severity: "INFO", details: `Infracción anulada por ${admin?.email ?? "la Junta"}: ${why}${reopen ? " · Examen reabierto" : ""}` } }),
    ]);
    await logAction({ action: "live.void_infraction", entityType: "session", entityId: sessionId, summary: `Anuló una infracción de ${s.candidate.fullName} (${why})${reopen ? " y reabrió su examen" : ""}` });
    return { ok: true, reopened: reopen };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo anular la infracción." };
  }
}
