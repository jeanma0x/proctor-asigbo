"use server";

import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/require-admin";

/** Cuántos eventos recientes se traen por sesión. */
const RECENT_LOGS = 5;

export async function getInProgressSessions() {
  if (!(await isAdmin())) throw new Error("No autorizado");
  return prisma.candidateSession.findMany({
    where: { status: "IN_PROGRESS" },
    orderBy: { startedAt: "asc" },
    include: {
      candidate: { select: { id: true, fullName: true, email: true, studentId: true } },
      exam: { select: { id: true, title: true, durationMinutes: true } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: RECENT_LOGS },
    },
  });
}

export type LiveSession = Awaited<ReturnType<typeof getInProgressSessions>>[number];
