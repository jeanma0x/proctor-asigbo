"use server";

import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/require-admin";
import { loadRanking } from "@/actions/ranking";

export type YearRow = {
  id: string; name: string; year: number; status: "ACTIVE" | "ARCHIVED";
  enabled: number; started: number; submitted: number; terminated: number;
  avgPct: number | null; completion: number; fraud: number;
};

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guatemala" }).format(d);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Métricas de una convocatoria (la elegida o la más reciente) + comparativo histórico de todas. */
export async function getDashboard(requestedId?: string) {
  if (!(await hasPermission("dashboard:view"))) return null;

  const [convs, exams, mcPoints, sessions] = await Promise.all([
    prisma.convocatoria.findMany({ orderBy: [{ year: "desc" }, { createdAt: "desc" }], select: { id: true, name: true, year: true, status: true } }),
    prisma.exam.findMany({ select: { id: true, title: true, durationMinutes: true, convocatoriaId: true } }),
    prisma.question.groupBy({ by: ["examId"], where: { type: "MULTIPLE_CHOICE" }, _sum: { points: true } }),
    prisma.candidateSession.findMany({ select: { id: true, examId: true, status: true, score: true, flagCount: true, decision: true, startedAt: true, submittedAt: true, candidate: { select: { fullName: true } } } }),
  ]);
  const examById = new Map(exams.map((e) => [e.id, e]));
  const maxByExam = new Map(mcPoints.map((m) => [m.examId, m._sum.points ?? 0]));
  const convOf = (examId: string) => examById.get(examId)?.convocatoriaId ?? null;
  const pctOf = (s: { examId: string; score: number | null }) => {
    const max = maxByExam.get(s.examId) ?? 0;
    return s.score != null && max > 0 ? (s.score / max) * 100 : null;
  };

  const history: YearRow[] = convs.map((c) => {
    const mine = sessions.filter((s) => convOf(s.examId) === c.id);
    const submitted = mine.filter((s) => s.status === "SUBMITTED");
    const pcts = submitted.map(pctOf).filter((p): p is number => p != null);
    const started = mine.filter((s) => s.status !== "NOT_STARTED").length;
    const terminated = mine.filter((s) => s.status === "TERMINATED").length;
    return {
      ...c, enabled: mine.length, started, submitted: submitted.length, terminated,
      avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
      completion: mine.length ? ((submitted.length + terminated) / mine.length) * 100 : 0,
      fraud: started ? (terminated / started) * 100 : 0,
    };
  });

  const selected = history.find((h) => h.id === requestedId) ?? history.find((h) => h.status === "ACTIVE") ?? history[0] ?? null;
  if (!selected) return { selected: null, convocatorias: [], history, extra: null };

  const idx = history.findIndex((h) => h.id === selected.id);
  const previous = history.slice(idx + 1).find((h) => h.enabled > 0) ?? null;

  const mine = sessions.filter((s) => convOf(s.examId) === selected.id);
  const submitted = mine.filter((s) => s.status === "SUBMITTED");
  const pcts = submitted.map(pctOf).filter((p): p is number => p != null);

  // Histograma en 10 rangos de 10 puntos porcentuales.
  const bins = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}–${i === 9 ? 100 : i * 10 + 9}`, value: 0 }));
  pcts.forEach((p) => { bins[Math.min(9, Math.floor(p / 10))].value++; });

  // Tiempo usado vs. asignado.
  const timeRatios = submitted.flatMap((s) => {
    const dur = examById.get(s.examId)?.durationMinutes;
    return s.startedAt && s.submittedAt && dur ? [((s.submittedAt.getTime() - s.startedAt.getTime()) / 60000 / dur) * 100] : [];
  });

  // Dispersión: tiempo usado (% del asignado) vs. aciertos, por candidato.
  const scatter = submitted.flatMap((s) => {
    const dur = examById.get(s.examId)?.durationMinutes;
    const p = pctOf(s);
    if (p == null || !s.startedAt || !s.submittedAt || !dur) return [];
    return [{ name: s.candidate.fullName, x: Math.min(110, ((s.submittedAt.getTime() - s.startedAt.getTime()) / 60000 / dur) * 100), y: p, flagged: s.flagCount > 0 }];
  });

  const outcome = {
    submitted: submitted.length,
    inProgress: mine.filter((s) => s.status === "IN_PROGRESS").length,
    terminated: mine.filter((s) => s.status === "TERMINATED").length,
    notStarted: mine.filter((s) => s.status === "NOT_STARTED").length,
  };

  const perDay = new Map<string, number>();
  submitted.forEach((s) => s.submittedAt && perDay.set(dayKey(s.submittedAt), (perDay.get(dayKey(s.submittedAt)) ?? 0) + 1));
  const daily = [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([label, value]) => ({ label, value }));

  const logs = await prisma.auditLog.groupBy({
    by: ["type"], _count: { _all: true },
    where: { type: { notIn: ["SESSION_START", "SESSION_SUBMIT"] }, session: { exam: { convocatoriaId: selected.id } } },
  });

  // Dificultad por pregunta (opción múltiple): % de entregas que la acertó.
  const convExams = exams.filter((e) => e.convocatoriaId === selected.id);
  const submittedByExam = new Map<string, number>();
  submitted.forEach((s) => submittedByExam.set(s.examId, (submittedByExam.get(s.examId) ?? 0) + 1));
  const [questions, hits] = await Promise.all([
    prisma.question.findMany({ where: { examId: { in: convExams.map((e) => e.id) }, type: "MULTIPLE_CHOICE" }, select: { id: true, text: true, examId: true } }),
    prisma.answer.groupBy({
      by: ["questionId"], _count: { _all: true },
      where: { session: { status: "SUBMITTED", exam: { convocatoriaId: selected.id } }, selectedOption: { isCorrect: true } },
    }),
  ]);
  const hitMap = new Map(hits.map((h) => [h.questionId, h._count._all]));
  const qStats = questions
    .map((q) => ({ id: q.id, text: q.text, n: submittedByExam.get(q.examId) ?? 0, pct: 0 }))
    .filter((q) => q.n > 0)
    .map((q) => ({ ...q, pct: Math.round(((hitMap.get(q.id) ?? 0) / q.n) * 100) }))
    .sort((a, b) => a.pct - b.pct);

  // Mejores candidatos del examen con más entregas.
  const topExam = [...submittedByExam.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const ranking = topExam ? await loadRanking(topExam, "integrity") : null;
  const toReview = ranking ? ranking.result.rows.filter((r) => r.reviewReasons.length).length : 0;

  const decisions = {
    selected: mine.filter((s) => s.decision === "SELECTED").length,
    waitlist: mine.filter((s) => s.decision === "WAITLIST").length,
    notSelected: mine.filter((s) => s.decision === "NOT_SELECTED").length,
  };

  return {
    selected, previous,
    convocatorias: convs.map((c) => ({ id: c.id, name: c.name, year: c.year })),
    history,
    extra: {
      inProgress: mine.filter((s) => s.status === "IN_PROGRESS").length,
      medianPct: median(pcts),
      bins,
      avgTimePct: timeRatios.length ? timeRatios.reduce((a, b) => a + b, 0) / timeRatios.length : null,
      daily,
      scatter,
      outcome,
      incidents: logs.map((l) => ({ type: l.type, count: l._count._all })).sort((a, b) => b.count - a.count),
      hardest: qStats.slice(0, 5),
      easiest: [...qStats].reverse().slice(0, 5),
      topExam: ranking ? { id: ranking.exam.id, title: ranking.exam.title } : null,
      top: ranking ? ranking.result.rows.slice(0, 5).map((r) => ({ sessionId: r.sessionId, name: r.name, index: r.index, flagCount: r.flagCount })) : [],
      toReview,
      decisions,
    },
  };
}
