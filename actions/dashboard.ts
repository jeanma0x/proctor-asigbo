"use server";

import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/require-admin";

export type YearRow = {
  id: string; name: string; year: number; status: "ACTIVE" | "ARCHIVED";
  enabled: number; started: number; submitted: number; terminated: number;
  avgPct: number | null; completion: number; fraud: number;
};

const BUCKETS = ["0–19%", "20–39%", "40–59%", "60–79%", "80–100%"];
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guatemala" }).format(d);

/** Métricas de una convocatoria (la elegida o la más reciente) + comparativo histórico de todas. */
export async function getDashboard(requestedId?: string) {
  if (!(await hasPermission("dashboard:view"))) return null;

  const [convs, exams, maxes, sessions] = await Promise.all([
    prisma.convocatoria.findMany({ orderBy: [{ year: "desc" }, { createdAt: "desc" }], select: { id: true, name: true, year: true, status: true } }),
    prisma.exam.findMany({ select: { id: true, convocatoriaId: true } }),
    prisma.question.groupBy({ by: ["examId"], _sum: { points: true } }),
    prisma.candidateSession.findMany({ select: { examId: true, status: true, score: true, submittedAt: true } }),
  ]);
  const convByExam = new Map(exams.map((e) => [e.id, e.convocatoriaId]));
  const maxByExam = new Map(maxes.map((m) => [m.examId, m._sum.points ?? 0]));

  const history: YearRow[] = convs.map((c) => {
    const mine = sessions.filter((s) => convByExam.get(s.examId) === c.id);
    const submitted = mine.filter((s) => s.status === "SUBMITTED");
    const pcts = submitted.filter((s) => s.score != null && (maxByExam.get(s.examId) ?? 0) > 0).map((s) => (s.score! / maxByExam.get(s.examId)!) * 100);
    const started = mine.filter((s) => s.status !== "NOT_STARTED").length;
    const terminated = mine.filter((s) => s.status === "TERMINATED").length;
    return {
      ...c,
      enabled: mine.length, started, submitted: submitted.length, terminated,
      avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
      completion: mine.length ? ((submitted.length + terminated) / mine.length) * 100 : 0,
      fraud: started ? (terminated / started) * 100 : 0,
    };
  });

  const selected = history.find((h) => h.id === requestedId) ?? history.find((h) => h.status === "ACTIVE") ?? history[0] ?? null;
  if (!selected) return { convocatorias: [], selected: null, history, distribution: [], daily: [], incidents: [], inProgress: 0 };

  const mine = sessions.filter((s) => convByExam.get(s.examId) === selected.id);
  const distribution = BUCKETS.map((label) => ({ label, count: 0 }));
  for (const s of mine) {
    const max = maxByExam.get(s.examId) ?? 0;
    if (s.status !== "SUBMITTED" || s.score == null || !max) continue;
    distribution[Math.min(4, Math.floor(((s.score / max) * 100) / 20))].count++;
  }
  const perDay = new Map<string, number>();
  for (const s of mine) if (s.submittedAt && s.status === "SUBMITTED") perDay.set(dayKey(s.submittedAt), (perDay.get(dayKey(s.submittedAt)) ?? 0) + 1);
  const daily = [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([day, count]) => ({ day, count }));

  const logs = await prisma.auditLog.groupBy({
    by: ["type"], _count: { _all: true },
    where: { type: { notIn: ["SESSION_START", "SESSION_SUBMIT"] }, session: { exam: { convocatoriaId: selected.id } } },
  });
  const incidents = logs.map((l) => ({ type: l.type, count: l._count._all })).sort((a, b) => b.count - a.count);

  return {
    convocatorias: convs.map((c) => ({ id: c.id, name: c.name, year: c.year })),
    selected, history, distribution, daily, incidents,
    inProgress: mine.filter((s) => s.status === "IN_PROGRESS").length,
  };
}
