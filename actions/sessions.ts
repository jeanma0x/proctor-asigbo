"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAdmin, hasPermission, UNAUTHORIZED } from "@/lib/require-admin";
import { appBaseUrl, emailConfigured, sendInvitationEmail } from "@/lib/email";
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
  if (!(await hasPermission("sessions:manage"))) return { ok: false, error: UNAUTHORIZED };
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

export type ExamSessionRow = {
  sessionId: string;
  name: string;
  email: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "TERMINATED";
  flagCount: number;
  score: number | null;
  emailSentAt: string | null;
  path: string;
};

/** Todos los aspirantes con acceso a un examen (para la tabla persistente de «Enlaces de acceso»). */
export async function listExamSessions(examId: string): Promise<ExamSessionRow[]> {
  if (!(await hasPermission("sessions:manage"))) return [];
  const rows = await prisma.candidateSession.findMany({
    where: { examId },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      id: true,
      status: true,
      flagCount: true,
      score: true,
      emailSentAt: true,
      candidate: { select: { fullName: true, email: true } },
    },
  });
  return rows.map((r) => ({
    sessionId: r.id,
    name: r.candidate.fullName,
    email: r.candidate.email,
    status: r.status,
    flagCount: r.flagCount,
    score: r.score,
    emailSentAt: r.emailSentAt?.toISOString() ?? null,
    path: `/exam/${examId}?session=${r.id}`,
  }));
}

export type SendResult =
  | { ok: true; sent: number; failed: { email: string; error: string }[] }
  | { ok: false; error: string };

const MAX_EMAILS_PER_CALL = 100;
const EMAIL_CONCURRENCY = 5;

/** Envía por correo (SMTP) la invitación con el enlace personal a las sesiones indicadas. */
export async function sendInvitations(examId: string, sessionIds: string[]): Promise<SendResult> {
  if (!(await hasPermission("sessions:manage"))) return { ok: false, error: UNAUTHORIZED };
  if (!emailConfigured())
    return { ok: false, error: "El envío por correo no está configurado (faltan variables SMTP en el servidor)." };
  const ids = [...new Set(sessionIds ?? [])].slice(0, MAX_EMAILS_PER_CALL);
  if (ids.length === 0) return { ok: false, error: "No hay aspirantes seleccionados." };

  try {
    const sessions = await prisma.candidateSession.findMany({
      where: { id: { in: ids }, examId, status: { in: ["NOT_STARTED", "IN_PROGRESS"] }, exam: { status: "PUBLISHED" } },
      select: {
        id: true,
        candidate: { select: { fullName: true, email: true } },
        exam: { select: { title: true, durationMinutes: true } },
      },
    });
    if (sessions.length === 0) return { ok: false, error: "Ningún aspirante elegible (examen no publicado o sesión finalizada)." };

    const base = appBaseUrl();
    const sentIds: string[] = [];
    const failed: { email: string; error: string }[] = [];
    for (let i = 0; i < sessions.length; i += EMAIL_CONCURRENCY) {
      await Promise.all(
        sessions.slice(i, i + EMAIL_CONCURRENCY).map(async (s) => {
          try {
            await sendInvitationEmail({
              to: s.candidate.email,
              name: s.candidate.fullName,
              examTitle: s.exam.title,
              durationMinutes: s.exam.durationMinutes,
              link: `${base}/exam/${examId}?session=${s.id}`,
            });
            sentIds.push(s.id);
          } catch (e) {
            console.error("email", s.candidate.email, e);
            failed.push({ email: s.candidate.email, error: "El servidor de correo rechazó el envío." });
          }
        }),
      );
    }
    if (sentIds.length) {
      await prisma.candidateSession.updateMany({ where: { id: { in: sentIds } }, data: { emailSentAt: new Date() } });
    }
    return { ok: true, sent: sentIds.length, failed };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudieron enviar los correos." };
  }
}

type Res = { ok: true } | { ok: false; error: string };
const refreshSessions = () => ["/admin/sessions", "/admin/live", "/admin/results", "/admin/dashboard", "/admin/candidates", "/admin/ranking"].forEach((p) => revalidatePath(p));

/** Quita el acceso de alguien que solo recibió el enlace y nunca inició (no hay datos que conservar). */
export async function removeSession(sessionId: string): Promise<Res> {
  if (!(await hasPermission("sessions:manage"))) return { ok: false, error: UNAUTHORIZED };
  try {
    const res = await prisma.candidateSession.deleteMany({ where: { id: sessionId, status: "NOT_STARTED" } });
    if (res.count === 0) return { ok: false, error: "Solo se puede quitar a quien aún no inició. Para empezar de nuevo usa «Reiniciar intento»." };
    refreshSessions();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo quitar el acceso." };
  }
}

/**
 * Reinicia el intento (p. ej. por una falla técnica): descarta respuestas y puntaje, vuelve a «Sin iniciar» y conserva
 * la bitácora anterior más un registro de quién lo reinició. El enlace sigue siendo el mismo.
 */
export async function resetSession(sessionId: string): Promise<Res> {
  if (!(await hasPermission("sessions:manage"))) return { ok: false, error: UNAUTHORIZED };
  const admin = await getAdmin();
  try {
    const s = await prisma.candidateSession.findUnique({ where: { id: sessionId }, select: { status: true, score: true, flagCount: true } });
    if (!s) return { ok: false, error: "La sesión no existe." };
    if (s.status === "NOT_STARTED") return { ok: false, error: "Esta persona aún no ha iniciado: no hay nada que reiniciar." };
    await prisma.$transaction([
      prisma.answer.deleteMany({ where: { sessionId } }),
      prisma.candidateSession.update({
        where: { id: sessionId },
        data: { status: "NOT_STARTED", startedAt: null, submittedAt: null, score: null, flagCount: 0, decision: null, decidedAt: null },
      }),
      prisma.auditLog.create({
        data: {
          sessionId, type: "OTHER", severity: "WARNING",
          details: `Intento reiniciado por ${admin?.email ?? "un administrador"}. Se descartaron respuestas y puntaje anteriores (estado: ${s.status}, puntaje: ${s.score ?? "-"}, infracciones: ${s.flagCount}).`,
        },
      }),
    ]);
    refreshSessions();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo reiniciar el intento." };
  }
}
