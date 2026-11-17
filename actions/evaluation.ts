"use server";

import { prisma } from "@/lib/prisma";
import { getAdmin, hasPermission, UNAUTHORIZED } from "@/lib/require-admin";
import { logAction } from "@/lib/audit";
import { loadRanking } from "@/actions/ranking";

export type Vote = "SELECTED" | "WAITLIST" | "NOT_SELECTED";
const VOTES: Vote[] = ["SELECTED", "WAITLIST", "NOT_SELECTED"];
const VOTE_ES: Record<Vote, string> = { SELECTED: "Seleccionado", WAITLIST: "Lista de espera", NOT_SELECTED: "No seleccionado" };

export type Tally = Record<Vote, number> & { total: number };
const emptyTally = (): Tally => ({ SELECTED: 0, WAITLIST: 0, NOT_SELECTED: 0, total: 0 });

export type BoardRow = {
  sessionId: string;
  /** null = no clasifica (examen cerrado por infracciones) */
  position: number | null;
  name: string;
  email: string;
  rawPct: number | null;
  index: number | null;
  flagCount: number;
  reviewReasons: string[];
  status: "SUBMITTED" | "TERMINATED";
  decision: Vote | null;
  decidedBy: string | null;
  myVote: Vote | null;
  myComment: boolean;
  tally: Tally;
  comments: number;
};

/** Cola de evaluación de un examen: candidatos en orden de ranking con el estado de las evaluaciones de la Junta. */
export async function getEvaluationBoard(examId: string): Promise<{ rows: BoardRow[]; voters: number; me: string } | null> {
  if (!(await hasPermission("ranking:view"))) return null;
  const admin = await getAdmin();
  if (!admin) return null;
  const data = await loadRanking(examId, "integrity");
  if (!data) return null;
  const [evals, voters] = await Promise.all([
    prisma.evaluation.findMany({ where: { session: { examId } }, select: { sessionId: true, adminId: true, vote: true, comment: true } }),
    prisma.adminUser.count({ where: { isActive: true } }),
  ]);
  const by = new Map<string, typeof evals>();
  for (const e of evals) by.set(e.sessionId, [...(by.get(e.sessionId) ?? []), e]);
  const mk = (sessionId: string) => {
    const list = by.get(sessionId) ?? [];
    const tally = emptyTally();
    for (const e of list) if (e.vote) { tally[e.vote]++; tally.total++; }
    const mine = list.find((e) => e.adminId === admin.id);
    return { tally, myVote: (mine?.vote ?? null) as Vote | null, myComment: !!mine?.comment.trim(), comments: list.filter((e) => e.comment.trim()).length };
  };
  const rows: BoardRow[] = [
    ...data.result.rows.map((r) => ({
      sessionId: r.sessionId, position: r.position, name: r.name, email: r.email, rawPct: r.rawPct, index: r.index, flagCount: r.flagCount,
      reviewReasons: r.reviewReasons, status: "SUBMITTED" as const, decision: r.decision as Vote | null, decidedBy: r.decidedBy, ...mk(r.sessionId),
    })),
    ...data.result.excluded.map((r) => ({
      sessionId: r.sessionId, position: null, name: r.name, email: r.email, rawPct: null, index: null, flagCount: r.flagCount,
      reviewReasons: ["Examen cerrado por infracciones"], status: "TERMINATED" as const, decision: r.decision as Vote | null, decidedBy: null, ...mk(r.sessionId),
    })),
  ];
  return { rows, voters, me: admin.id };
}

export type EvalItem = { adminId: string; adminName: string; vote: Vote | null; comment: string; updatedAt: string; mine: boolean };

/** Todo lo necesario para la pantalla de evaluación de un candidato: evaluaciones de la Junta y navegación entre candidatos. */
export async function getEvaluationContext(sessionId: string) {
  if (!(await hasPermission("ranking:view"))) return null;
  const admin = await getAdmin();
  if (!admin) return null;
  const s = await prisma.candidateSession.findUnique({ where: { id: sessionId }, select: { examId: true, decision: true, decidedBy: true, decidedAt: true } });
  if (!s) return null;
  const [board, list, voters] = await Promise.all([
    getEvaluationBoard(s.examId),
    prisma.evaluation.findMany({ where: { sessionId }, orderBy: { updatedAt: "asc" } }),
    prisma.adminUser.count({ where: { isActive: true } }),
  ]);
  const rows = board?.rows ?? [];
  const i = rows.findIndex((r) => r.sessionId === sessionId);
  const nextPending = [...rows.slice(i + 1), ...rows.slice(0, Math.max(0, i))].find((r) => !r.myVote && r.sessionId !== sessionId);
  const evaluations: EvalItem[] = list.map((e) => ({ adminId: e.adminId, adminName: e.adminName, vote: e.vote as Vote | null, comment: e.comment, updatedAt: e.updatedAt.toISOString(), mine: e.adminId === admin.id }));
  const tally = emptyTally();
  for (const e of evaluations) if (e.vote) { tally[e.vote]++; tally.total++; }
  return {
    examId: s.examId,
    position: i >= 0 ? i + 1 : null,
    total: rows.length,
    rankPosition: i >= 0 ? rows[i].position : null,
    prevId: i > 0 ? rows[i - 1].sessionId : null,
    nextId: i >= 0 && i < rows.length - 1 ? rows[i + 1].sessionId : null,
    nextPendingId: nextPending?.sessionId ?? null,
    myPending: rows.filter((r) => !r.myVote).length,
    evaluations, tally, voters,
    decision: s.decision as Vote | null, decidedBy: s.decidedBy, decidedAt: s.decidedAt?.toISOString() ?? null,
  };
}

/** Guarda el voto y/o el comentario del miembro de la Junta actual (uno por persona y candidato). */
export async function saveEvaluation(sessionId: string, input: { vote?: Vote | null; comment?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await hasPermission("evaluation:write"))) return { ok: false, error: UNAUTHORIZED };
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: UNAUTHORIZED };
  if (input.vote !== undefined && input.vote !== null && !VOTES.includes(input.vote)) return { ok: false, error: "Voto inválido." };
  const comment = input.comment === undefined ? undefined : input.comment.trim().slice(0, 1500);
  try {
    const s = await prisma.candidateSession.findUnique({ where: { id: sessionId }, select: { status: true, candidate: { select: { fullName: true } }, exam: { select: { title: true } } } });
    if (!s) return { ok: false, error: "La sesión no existe." };
    if (s.status !== "SUBMITTED" && s.status !== "TERMINATED") return { ok: false, error: "Solo se evalúa a quien ya entregó o cerró su examen." };
    const prev = await prisma.evaluation.findUnique({ where: { sessionId_adminId: { sessionId, adminId: admin.id } }, select: { vote: true, comment: true } });
    const name = admin.name || admin.email;
    await prisma.evaluation.upsert({
      where: { sessionId_adminId: { sessionId, adminId: admin.id } },
      create: { sessionId, adminId: admin.id, adminName: name, vote: input.vote ?? null, comment: comment ?? "" },
      update: { adminName: name, ...(input.vote !== undefined ? { vote: input.vote } : {}), ...(comment !== undefined ? { comment } : {}) },
    });
    if (input.vote !== undefined && (prev?.vote ?? null) !== input.vote)
      await logAction({ action: "evaluation.vote", entityType: "session", entityId: sessionId, summary: `${input.vote ? `Votó «${VOTE_ES[input.vote]}»` : "Quitó su voto"} para ${s.candidate.fullName} en «${s.exam.title}»` });
    if (comment !== undefined && comment !== (prev?.comment ?? ""))
      await logAction({ action: "evaluation.comment", entityType: "session", entityId: sessionId, summary: `Dejó un comentario sobre ${s.candidate.fullName} en «${s.exam.title}»` });
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar tu evaluación." };
  }
}
