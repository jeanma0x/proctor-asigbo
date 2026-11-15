/**
 * Motor de ranking de candidatos de un examen (puro, sin dependencias de servidor).
 *
 * Tres métodos, de más simple a más fino:
 *  - raw        → % de aciertos (puntos obtenidos / puntos de opción múltiple).
 *  - difficulty → % ponderado por dificultad: cada pregunta pesa 1 + (1 − p), donde p es la fracción de
 *                 candidatos que la acertó. Acertar una pregunta que casi nadie acierta vale hasta el doble que
 *                 una que casi todos aciertan. Con menos de 5 candidatos la dificultad no es confiable y todos pesan 1.
 *  - integrity  → % ponderado por dificultad − 5 puntos por cada infracción (mínimo 0).  ← recomendado
 *
 * Desempates (en orden): menos infracciones, menor tiempo utilizado, entrega más temprana.
 * Solo se clasifican las sesiones ENTREGADAS; las cerradas por fraude se listan aparte.
 * Las preguntas abiertas no se califican automáticamente y no entran al índice.
 */
export type RankMethod = "raw" | "difficulty" | "integrity";

export const METHOD_INFO: Record<RankMethod, { label: string; description: string }> = {
  raw: { label: "Puntaje bruto", description: "Porcentaje de aciertos, sin ajustes." },
  difficulty: {
    label: "Ponderado por dificultad",
    description: "Las preguntas que menos candidatos aciertan valen más (hasta el doble). Distingue mejor a quienes sobresalen.",
  },
  integrity: {
    label: "Ponderado + integridad",
    description: "Como el anterior, restando 5 puntos por cada infracción de seguridad. Recomendado.",
  },
};

export const STRIKE_PENALTY = 5;
const MIN_FOR_DIFFICULTY = 5;

export type RankInput = {
  sessionId: string;
  name: string;
  email: string;
  status: "SUBMITTED" | "TERMINATED";
  flagCount: number;
  startedAt: Date | null;
  submittedAt: Date | null;
  decision: "SELECTED" | "WAITLIST" | "NOT_SELECTED" | null;
  /** questionId → acertó (solo preguntas de opción múltiple) */
  correct: Record<string, boolean>;
};

export type RankQuestion = { id: string; text: string; points: number; type: "MULTIPLE_CHOICE" | "TEXT" };

export type RankRow = {
  position: number;
  tied: boolean;
  sessionId: string;
  name: string;
  email: string;
  flagCount: number;
  decision: RankInput["decision"];
  rawPct: number;
  weightedPct: number;
  index: number;
  minutes: number | null;
  timePct: number | null;
  percentile: number;
  zScore: number | null;
  reviewReasons: string[];
};

export type RankResult = {
  method: RankMethod;
  rows: RankRow[];
  excluded: { sessionId: string; name: string; email: string; flagCount: number; decision: RankInput["decision"] }[];
  stats: { n: number; mean: number; median: number; stdev: number; min: number; max: number };
  questions: { id: string; text: string; points: number; pctCorrect: number; weight: number }[];
  difficultyReliable: boolean;
  hasOpenQuestions: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeRanking(
  inputs: RankInput[],
  questions: RankQuestion[],
  durationMinutes: number,
  method: RankMethod,
): RankResult {
  const mc = questions.filter((q) => q.type === "MULTIPLE_CHOICE");
  const submitted = inputs.filter((i) => i.status === "SUBMITTED");
  const n = submitted.length;
  const difficultyReliable = n >= MIN_FOR_DIFFICULTY;

  const qStats = mc.map((q) => {
    const hits = submitted.filter((s) => s.correct[q.id]).length;
    const p = n ? hits / n : 0;
    return { id: q.id, text: q.text, points: q.points, pctCorrect: p * 100, weight: difficultyReliable ? 1 + (1 - p) : 1 };
  });
  const maxRaw = mc.reduce((a, q) => a + q.points, 0);
  const maxWeighted = qStats.reduce((a, q) => a + q.weight * q.points, 0);

  const scored = submitted.map((s) => {
    const raw = mc.reduce((a, q) => a + (s.correct[q.id] ? q.points : 0), 0);
    const weighted = qStats.reduce((a, q) => a + (s.correct[q.id] ? q.weight * q.points : 0), 0);
    const rawPct = maxRaw ? (raw / maxRaw) * 100 : 0;
    const weightedPct = maxWeighted ? (weighted / maxWeighted) * 100 : 0;
    const index =
      method === "raw" ? rawPct : method === "difficulty" ? weightedPct : Math.max(0, weightedPct - STRIKE_PENALTY * s.flagCount);
    const minutes = s.startedAt && s.submittedAt ? (s.submittedAt.getTime() - s.startedAt.getTime()) / 60000 : null;
    return { s, rawPct, weightedPct, index: round2(index), minutes };
  });

  scored.sort(
    (a, b) =>
      b.index - a.index ||
      a.s.flagCount - b.s.flagCount ||
      (a.minutes ?? Infinity) - (b.minutes ?? Infinity) ||
      (a.s.submittedAt?.getTime() ?? 0) - (b.s.submittedAt?.getTime() ?? 0),
  );

  const idx = scored.map((x) => x.index);
  const mean = n ? idx.reduce((a, b) => a + b, 0) / n : 0;
  const stdev = n > 1 ? Math.sqrt(idx.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const sortedAsc = [...idx].sort((a, b) => a - b);
  const median = n ? (n % 2 ? sortedAsc[(n - 1) / 2] : (sortedAsc[n / 2 - 1] + sortedAsc[n / 2]) / 2) : 0;

  const rows: RankRow[] = scored.map((x, i) => {
    const lower = idx.filter((v) => v < x.index).length;
    const timePct = x.minutes != null && durationMinutes ? (x.minutes / durationMinutes) * 100 : null;
    const reasons: string[] = [];
    if (x.s.flagCount > 0) reasons.push(`${x.s.flagCount} infracción(es) de seguridad`);
    if (timePct != null && timePct < 25 && x.rawPct >= 80) reasons.push("Terminó en menos de un cuarto del tiempo con puntaje alto");
    return {
      position: i + 1,
      tied: (i > 0 && idx[i - 1] === x.index) || (i < n - 1 && idx[i + 1] === x.index),
      sessionId: x.s.sessionId, name: x.s.name, email: x.s.email, flagCount: x.s.flagCount, decision: x.s.decision,
      rawPct: round2(x.rawPct), weightedPct: round2(x.weightedPct), index: x.index,
      minutes: x.minutes == null ? null : Math.max(1, Math.round(x.minutes)),
      timePct: timePct == null ? null : Math.round(timePct),
      percentile: n > 1 ? Math.round((lower / (n - 1)) * 100) : 100,
      zScore: stdev > 0 ? round2((x.index - mean) / stdev) : null,
      reviewReasons: reasons,
    };
  });

  return {
    method,
    rows,
    excluded: inputs.filter((i) => i.status === "TERMINATED").map((i) => ({ sessionId: i.sessionId, name: i.name, email: i.email, flagCount: i.flagCount, decision: i.decision })),
    stats: { n, mean: round2(mean), median: round2(median), stdev: round2(stdev), min: sortedAsc[0] ?? 0, max: sortedAsc[n - 1] ?? 0 },
    questions: qStats.map((q) => ({ ...q, pctCorrect: Math.round(q.pctCorrect), weight: round2(q.weight) })),
    difficultyReliable,
    hasOpenQuestions: questions.some((q) => q.type === "TEXT"),
  };
}
