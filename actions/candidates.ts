"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAdmin, hasPermission, UNAUTHORIZED } from "@/lib/require-admin";
import { logAction } from "@/lib/audit";
import { loadRanking } from "@/actions/ranking";

type Decision = "SELECTED" | "WAITLIST" | "NOT_SELECTED" | null;
type Status = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "TERMINATED";

export type CandidateFilters = { q?: string; convocatoriaId?: string; decision?: "SELECTED" | "WAITLIST" | "NOT_SELECTED" | "UNDECIDED"; pendingOnly?: boolean };

export type CandidateRow = {
  id: string;
  name: string;
  email: string;
  participations: number;
  lastExam: string | null;
  lastConvocatoria: string | null;
  lastStatus: Status | null;
  lastPct: number | null;
  decision: Decision;
  flags: number;
  pendingGrade: number;
  notes: number;
};

const MAX = 500;

/** Directorio de candidatos con su participación más reciente. */
export async function listCandidates(f: CandidateFilters): Promise<{ rows: CandidateRow[]; convocatorias: { id: string; name: string; year: number }[]; truncated: boolean } | null> {
  if (!(await hasPermission("results:view"))) return null;
  const q = f.q?.trim();
  const candidates = await prisma.candidate.findMany({
    where: {
      ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { studentId: { contains: q, mode: "insensitive" } }] } : {}),
      ...(f.convocatoriaId ? { sessions: { some: { exam: { convocatoriaId: f.convocatoriaId } } } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: MAX,
    select: {
      id: true, fullName: true, email: true,
      _count: { select: { notes: true } },
      sessions: {
        orderBy: { createdAt: "desc" },
        select: {
          status: true, score: true, flagCount: true, decision: true,
          exam: { select: { id: true, title: true, convocatoria: { select: { name: true } } } },
          answers: { select: { manualScore: true, textResponse: true, question: { select: { type: true } } } },
        },
      },
    },
  });
  const [maxes, convocatorias] = await Promise.all([
    prisma.question.groupBy({ by: ["examId"], _sum: { points: true } }),
    prisma.convocatoria.findMany({ orderBy: [{ year: "desc" }], select: { id: true, name: true, year: true } }),
  ]);
  const maxBy = new Map(maxes.map((m) => [m.examId, m._sum.points ?? 0]));

  let rows: CandidateRow[] = candidates.map((c) => {
    const real = c.sessions.filter((s) => s.status !== "NOT_STARTED");
    const last = real[0] ?? c.sessions[0] ?? null;
    const max = last ? (maxBy.get(last.exam.id) ?? 0) : 0;
    return {
      id: c.id, name: c.fullName, email: c.email,
      participations: real.length,
      lastExam: last?.exam.title ?? null, lastConvocatoria: last?.exam.convocatoria?.name ?? null, lastStatus: last?.status ?? null,
      lastPct: last && last.score != null && max ? (last.score / max) * 100 : null,
      decision: real.find((s) => s.decision)?.decision ?? null,
      flags: real.reduce((n, s) => n + s.flagCount, 0),
      pendingGrade: c.sessions.reduce((n, s) => n + s.answers.filter((a) => a.question.type === "TEXT" && a.textResponse?.trim() && a.manualScore == null).length, 0),
      notes: c._count.notes,
    };
  });
  if (f.decision) rows = rows.filter((r) => (f.decision === "UNDECIDED" ? r.decision === null && r.participations > 0 : r.decision === f.decision));
  if (f.pendingOnly) rows = rows.filter((r) => r.pendingGrade > 0);
  return { rows, convocatorias, truncated: candidates.length >= MAX };
}

export type ProfileSession = {
  id: string;
  examId: string;
  examTitle: string;
  convocatoria: string | null;
  year: number | null;
  status: Status;
  score: number | null;
  maxScore: number;
  flagCount: number;
  decision: Decision;
  decidedBy: string | null;
  decidedAt: Date | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  rank: { position: number; of: number; percentile: number } | null;
  pendingGrade: number;
};

export type CandidateProfile = {
  id: string;
  fullName: string;
  email: string;
  studentId: string | null;
  createdAt: Date;
  sessions: ProfileSession[];
  notes: { id: string; authorId: string | null; authorName: string; body: string; createdAt: Date }[];
  /** Acciones de la Junta sobre esta persona (decisiones, calificaciones, reinicios…), más recientes primero. */
  history: { id: string; who: string; summary: string; createdAt: Date }[];
};

/** Perfil completo: historial de participaciones con posición en el ranking de cada examen, y notas internas. */
export async function getCandidateProfile(id: string): Promise<CandidateProfile | null> {
  if (!(await hasPermission("results:view"))) return null;
  const c = await prisma.candidate.findUnique({
    where: { id },
    select: {
      id: true, fullName: true, email: true, studentId: true, createdAt: true,
      notes: { orderBy: { createdAt: "desc" }, select: { id: true, authorId: true, authorName: true, body: true, createdAt: true } },
      sessions: {
        orderBy: { createdAt: "desc" },
        where: { status: { not: "NOT_STARTED" } },
        select: {
          id: true, status: true, score: true, flagCount: true, decision: true, decidedBy: true, decidedAt: true, startedAt: true, submittedAt: true,
          exam: { select: { id: true, title: true, convocatoria: { select: { name: true, year: true } } } },
          answers: { select: { manualScore: true, textResponse: true, question: { select: { type: true } } } },
        },
      },
    },
  });
  if (!c) return null;
  const examIds = [...new Set(c.sessions.map((s) => s.exam.id))];
  const entityIds = [c.id, ...c.sessions.map((s) => s.id)];
  const [maxes, rankings, hist] = await Promise.all([
    prisma.question.groupBy({ by: ["examId"], where: { examId: { in: examIds } }, _sum: { points: true } }),
    Promise.all(examIds.map((e) => loadRanking(e, "integrity"))),
    prisma.adminActionLog.findMany({ where: { entityId: { in: entityIds }, entityType: { in: ["session", "candidate"] } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, actorName: true, actorEmail: true, summary: true, createdAt: true } }),
  ]);
  const maxBy = new Map(maxes.map((m) => [m.examId, m._sum.points ?? 0]));
  const rankBy = new Map(examIds.map((e, i) => [e, rankings[i]]));

  return {
    id: c.id, fullName: c.fullName, email: c.email, studentId: c.studentId, createdAt: c.createdAt, notes: c.notes,
    history: hist.map((h) => ({ id: h.id, who: h.actorName || h.actorEmail.split("@")[0], summary: h.summary, createdAt: h.createdAt })),
    sessions: c.sessions.map((s) => {
      const rk = rankBy.get(s.exam.id);
      const row = rk?.result.rows.find((r) => r.sessionId === s.id);
      return {
        id: s.id, examId: s.exam.id, examTitle: s.exam.title, convocatoria: s.exam.convocatoria?.name ?? null, year: s.exam.convocatoria?.year ?? null,
        status: s.status, score: s.score, maxScore: maxBy.get(s.exam.id) ?? 0, flagCount: s.flagCount, decision: s.decision, decidedBy: s.decidedBy, decidedAt: s.decidedAt,
        startedAt: s.startedAt, submittedAt: s.submittedAt,
        rank: row && rk ? { position: row.position, of: rk.result.stats.n, percentile: row.percentile } : null,
        pendingGrade: s.answers.filter((a) => a.question.type === "TEXT" && a.textResponse?.trim() && a.manualScore == null).length,
      };
    }),
  };
}

type Res = { ok: true } | { ok: false; error: string };
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addNote(candidateId: string, body: string): Promise<Res> {
  if (!(await hasPermission("results:grade"))) return { ok: false, error: UNAUTHORIZED };
  const admin = await getAdmin();
  const text = body?.trim().slice(0, 2000);
  if (!admin || !text) return { ok: false, error: "Escribe la nota." };
  try {
    await prisma.candidateNote.create({ data: { candidateId, authorId: admin.id, authorName: admin.name || admin.email, body: text } });
    await logAction({ action: "candidate.note", entityType: "candidate", entityId: candidateId, summary: "Agregó una nota interna" });
    revalidatePath(`/admin/candidates/${candidateId}`);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar la nota." };
  }
}

/** Solo el autor o un superadmin puede borrar una nota. */
export async function deleteNote(noteId: string): Promise<Res> {
  if (!(await hasPermission("results:grade"))) return { ok: false, error: UNAUTHORIZED };
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: UNAUTHORIZED };
  try {
    const note = await prisma.candidateNote.findUnique({ where: { id: noteId }, select: { authorId: true, candidateId: true } });
    if (!note) return { ok: false, error: "La nota no existe." };
    if (note.authorId !== admin.id && admin.role !== "SUPERADMIN") return { ok: false, error: "Solo el autor o un superadmin puede borrar esta nota." };
    await prisma.candidateNote.delete({ where: { id: noteId } });
    await logAction({ action: "candidate.note_delete", entityType: "candidate", entityId: note.candidateId, summary: "Borró una nota interna" });
    revalidatePath(`/admin/candidates/${note.candidateId}`);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo borrar la nota." };
  }
}

/** Corrige nombre/correo (errores de tipeo). El correo es único en todo el sistema. */
export async function updateCandidate(id: string, input: { fullName: string; email: string }): Promise<Res> {
  if (!(await hasPermission("candidates:edit"))) return { ok: false, error: UNAUTHORIZED };
  const fullName = input.fullName?.trim().replace(/\s+/g, " ").slice(0, 120);
  const email = input.email?.trim().toLowerCase();
  if (!fullName) return { ok: false, error: "El nombre es obligatorio." };
  if (!email || !EMAIL_OK.test(email) || email.length > 254) return { ok: false, error: "Correo inválido." };
  try {
    if (!(await prisma.candidate.findUnique({ where: { id }, select: { id: true } }))) return { ok: false, error: "El candidato no existe." };
    const other = await prisma.candidate.findUnique({ where: { email }, select: { id: true } });
    if (other && other.id !== id) return { ok: false, error: "Ya existe otro candidato con ese correo." };
    const before = await prisma.candidate.findUnique({ where: { id }, select: { fullName: true, email: true } });
    await prisma.candidate.update({ where: { id }, data: { fullName, email } });
    await logAction({ action: "candidate.update", entityType: "candidate", entityId: id, summary: `Corrigió los datos del candidato: «${before?.fullName}» <${before?.email}> → «${fullName}» <${email}>` });
    revalidatePath(`/admin/candidates/${id}`);
    revalidatePath("/admin/candidates");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo actualizar el candidato." };
  }
}

/**
 * Elimina a un candidato. Sin participaciones iniciadas: se borra junto con sus enlaces y notas. Con historial
 * (exámenes iniciados/entregados): solo un superadmin, escribiendo el nombre exacto, y se pierde todo su historial.
 */
export async function deleteCandidate(id: string, confirmName?: string): Promise<Res> {
  if (!(await hasPermission("candidates:edit"))) return { ok: false, error: UNAUTHORIZED };
  try {
    const c = await prisma.candidate.findUnique({ where: { id }, select: { fullName: true, email: true, _count: { select: { notes: true, sessions: true } }, sessions: { where: { status: { not: "NOT_STARTED" } }, select: { id: true } } } });
    if (!c) return { ok: false, error: "El candidato no existe." };
    const started = c.sessions.length;
    if (started > 0) {
      if (!(await hasPermission("users:manage"))) return { ok: false, error: "Este candidato tiene exámenes iniciados o entregados: solo un superadmin puede eliminarlo con todo su historial." };
      if ((confirmName ?? "").trim() !== c.fullName) return { ok: false, error: "El nombre escrito no coincide." };
    }
    await prisma.candidate.delete({ where: { id } }); // sesiones, respuestas, eventos y notas caen en cascada
    await logAction({ action: "candidate.delete", entityType: "candidate", entityId: id, summary: `Eliminó al candidato ${c.fullName} <${c.email}> (${c._count.sessions} sesión(es), ${started} iniciada(s), ${c._count.notes} nota(s))` });
    ["/admin/candidates", "/admin/sessions", "/admin/results", "/admin/ranking", "/admin/dashboard", "/admin/live"].forEach((p) => revalidatePath(p));
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo eliminar al candidato." };
  }
}
