"use server";

import { prisma } from "@/lib/prisma";
import { isAdmin, UNAUTHORIZED } from "@/lib/require-admin";

/** Cuántos eventos recientes se traen por sesión en curso. */
const RECENT_LOGS = 5;

const candidateSel = { select: { id: true, fullName: true, email: true, studentId: true } } as const;
const examSel = { select: { id: true, title: true, durationMinutes: true } } as const;

/**
 * Foto del estado de todas las sesiones de exámenes publicados: las que están en curso
 * (con sus últimos eventos) y las demás (sin iniciar / finalizadas) para las otras pestañas.
 */
export async function getLiveOverview() {
  if (!(await isAdmin())) throw new Error("No autorizado");
  const [active, others] = await Promise.all([
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
  ]);
  return [...active, ...others.map((s) => ({ ...s, auditLogs: [] as typeof active[number]["auditLogs"] }))];
}

export type LiveSession = Awaited<ReturnType<typeof getLiveOverview>>[number];

/** Historial completo de eventos de una sesión (para el panel expandible). */
export async function getSessionLogs(sessionId: string) {
  if (!(await isAdmin())) throw new Error("No autorizado");
  return prisma.auditLog.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, type: true, severity: true, details: true, createdAt: true },
  });
}

/** Cierra manualmente una sesión en curso (por decisión de la Junta). */
export async function terminateSession(sessionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdmin())) return { ok: false, error: UNAUTHORIZED };
  try {
    const res = await prisma.candidateSession.updateMany({
      where: { id: sessionId, status: "IN_PROGRESS" },
      data: { status: "TERMINATED", submittedAt: new Date() },
    });
    if (res.count === 0) return { ok: false, error: "La sesión ya no está en curso." };
    await prisma.auditLog.create({
      data: { sessionId, type: "OTHER", severity: "CRITICAL", details: "Sesión cerrada manualmente por la Junta" },
    });
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo cerrar la sesión." };
  }
}
