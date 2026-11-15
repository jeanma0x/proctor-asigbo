"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAdmin, UNAUTHORIZED } from "@/lib/require-admin";
import type { CandidateInput } from "@/lib/parse-candidates";

export type GeneratedSession = {
  name: string;
  email: string;
  sessionId: string;
  /** Ruta relativa; la UI antepone el origin. */
  path: string;
  /** true si la sesión ya existía (se reutiliza el mismo enlace). */
  existing: boolean;
};

export type GenerateResult =
  | { ok: true; rows: GeneratedSession[] }
  | { ok: false; error: string };

const MAX_BATCH = 500;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Crea Candidates (si no existen) y sus CandidateSession para un examen publicado.
 * Es idempotente: re-ejecutarla con el mismo correo devuelve la sesión existente.
 */
export async function generateSessions(examId: string, candidates: CandidateInput[]): Promise<GenerateResult> {
  if (!(await isAdmin())) return { ok: false, error: UNAUTHORIZED };
  try {
    const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { status: true } });
    if (!exam) return { ok: false, error: "El examen no existe." };
    if (exam.status !== "PUBLISHED") return { ok: false, error: "Solo se pueden generar enlaces para exámenes publicados." };

    // Normaliza y deduplica por correo conservando el orden de entrada.
    const byEmail = new Map<string, string>();
    for (const c of candidates ?? []) {
      const email = c.email?.trim().toLowerCase();
      if (!email || !EMAIL_OK.test(email)) return { ok: false, error: `Correo inválido: "${c.email}".` };
      if (!byEmail.has(email)) byEmail.set(email, c.name?.trim().slice(0, 120) || email.split("@")[0]);
    }
    if (byEmail.size === 0) return { ok: false, error: "No hay candidatos válidos." };
    if (byEmail.size > MAX_BATCH) return { ok: false, error: `Máximo ${MAX_BATCH} candidatos por lote.` };
    const emails = [...byEmail.keys()];

    const { sessions, preExisting } = await prisma.$transaction(async (tx) => {
      await tx.candidate.createMany({
        data: emails.map((email) => ({ email, fullName: byEmail.get(email)! })),
        skipDuplicates: true,
      });
      const cands = await tx.candidate.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true, fullName: true },
      });
      const before = await tx.candidateSession.findMany({
        where: { examId, candidateId: { in: cands.map((c) => c.id) } },
        select: { candidateId: true },
      });
      const preExisting = new Set(before.map((s) => s.candidateId));

      await tx.candidateSession.createMany({
        data: cands.map((c) => ({ candidateId: c.id, examId })),
        skipDuplicates: true, // @@unique([candidateId, examId])
      });
      const all = await tx.candidateSession.findMany({
        where: { examId, candidateId: { in: cands.map((c) => c.id) } },
        select: { id: true, candidateId: true },
      });
      const sessionByCandidate = new Map(all.map((s) => [s.candidateId, s.id]));
      const candByEmail = new Map(cands.map((c) => [c.email, c]));

      return {
        preExisting,
        sessions: emails.flatMap((email) => {
          const c = candByEmail.get(email);
          const sessionId = c && sessionByCandidate.get(c.id);
          return c && sessionId ? [{ c, sessionId }] : [];
        }),
      };
    });

    const rows: GeneratedSession[] = sessions.map(({ c, sessionId }) => ({
      name: c.fullName,
      email: c.email,
      sessionId,
      path: `/exam/${examId}?session=${sessionId}`,
      existing: preExisting.has(c.id),
    }));
    revalidatePath("/admin/live");
    return { ok: true, rows };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudieron generar las sesiones." };
  }
}
