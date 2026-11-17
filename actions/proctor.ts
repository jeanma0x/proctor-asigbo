"use server";

import { prisma } from "@/lib/prisma";
import { MAX_STRIKES } from "@/lib/proctor-constants";
import { fmtDateTime } from "@/lib/format";
import { windowState } from "@/lib/exam-window";

/** Margen de red para aceptar una entrega justo al vencer el tiempo. */
const SUBMIT_GRACE_MS = 60_000;

type EventType =
  | "TAB_CHANGE"
  | "WINDOW_BLUR"
  | "FULLSCREEN_EXIT"
  | "PASTE_ATTEMPT"
  | "COPY_ATTEMPT"
  | "CUT_ATTEMPT"
  | "CONTEXT_MENU"
  | "OTHER";

/** Eventos que suman un strike. El resto se registra en el AuditLog sin penalizar. */
const STRIKE_EVENTS: ReadonlySet<EventType> = new Set(["TAB_CHANGE", "WINDOW_BLUR", "FULLSCREEN_EXIT"]);
const ALLOWED_EVENTS: ReadonlySet<string> = new Set([
  ...STRIKE_EVENTS,
  "PASTE_ATTEMPT",
  "COPY_ATTEMPT",
  "CUT_ATTEMPT",
  "CONTEXT_MENU",
  "OTHER",
]);

export type StartSessionResult =
  | { ok: true; startedAt: string; serverNow: string; durationMinutes: number; flagCount: number }
  | { ok: false; error: string };

/** Inicia (o reanuda) la sesión. El reloj de inicio lo fija SIEMPRE el servidor. */
export async function startSession(sessionId: string): Promise<StartSessionResult> {
  try {
    const session = await prisma.candidateSession.findUnique({
      where: { id: sessionId },
      include: { exam: { select: { status: true, durationMinutes: true, opensAt: true, closesAt: true } } },
    });
    if (!session) return { ok: false, error: "Sesión no encontrada." };
    if (session.exam.status !== "PUBLISHED") return { ok: false, error: "El examen no está disponible." };
    if (session.status === "SUBMITTED" || session.status === "TERMINATED")
      return { ok: false, error: "Esta sesión ya finalizó." };

    // Solo se restringe el INICIO: quien ya empezó puede terminar su tiempo aunque la ventana cierre.
    if (session.status === "NOT_STARTED") {
      const w = windowState(session.exam, new Date());
      if (w === "not_open") return { ok: false, error: `El examen abre el ${fmtDateTime(session.exam.opensAt)} (hora de Guatemala).` };
      if (w === "closed") return { ok: false, error: `El plazo para presentar este examen terminó el ${fmtDateTime(session.exam.closesAt)} (hora de Guatemala).` };
    }

    let startedAt = session.startedAt;
    if (session.status === "NOT_STARTED" || !startedAt) {
      startedAt = new Date();
      await prisma.$transaction([
        prisma.candidateSession.update({
          where: { id: sessionId },
          data: { status: "IN_PROGRESS", startedAt },
        }),
        prisma.auditLog.create({
          data: { sessionId, type: "SESSION_START", severity: "INFO", details: "Inicio del examen" },
        }),
      ]);
    }

    return {
      ok: true,
      startedAt: startedAt.toISOString(),
      serverNow: new Date().toISOString(),
      durationMinutes: session.exam.durationMinutes,
      flagCount: session.flagCount,
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo iniciar la sesión." };
  }
}

export type InfractionResult =
  | { ok: true; flagCount: number; terminated: boolean; strike: boolean; excused?: boolean }
  | { ok: false; error: string };

/**
 * Registra una incidencia. En una única transacción: crea el AuditLog e incrementa
 * flagCount (solo eventos de strike). Al llegar a MAX_STRIKES la sesión pasa a TERMINATED.
 */
export async function logInfraction(
  sessionId: string,
  eventType: string,
  details?: string,
): Promise<InfractionResult> {
  if (!ALLOWED_EVENTS.has(eventType)) return { ok: false, error: "Tipo de evento inválido." };
  const type = eventType as EventType;
  const isStrike = STRIKE_EVENTS.has(type);

  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.candidateSession.findUnique({
        where: { id: sessionId },
        select: { status: true, flagCount: true, graceUntil: true },
      });
      if (!current) return { ok: false as const, error: "Sesión no encontrada." };
      if (current.status === "TERMINATED")
        return { ok: true as const, flagCount: current.flagCount, terminated: true, strike: false };
      if (current.status !== "IN_PROGRESS") return { ok: false as const, error: "La sesión no está activa." };

      // Salida autorizada por la Junta (p. ej. consultar Zoom): se registra, pero no suma infracción.
      if (isStrike && current.graceUntil && current.graceUntil.getTime() > Date.now()) {
        await tx.auditLog.create({ data: { sessionId, type, severity: "INFO", details: `Salida autorizada por la Junta. ${details ?? ""}`.trim().slice(0, 500) } });
        return { ok: true as const, flagCount: current.flagCount, terminated: false, strike: false, excused: true };
      }

      const updated = await tx.candidateSession.update({
        where: { id: sessionId },
        data: isStrike ? { flagCount: { increment: 1 } } : {},
        select: { flagCount: true },
      });
      const terminated = isStrike && updated.flagCount >= MAX_STRIKES;

      await tx.auditLog.create({
        data: {
          sessionId,
          type,
          severity: terminated ? "CRITICAL" : "WARNING",
          details: details?.slice(0, 500) ?? null,
        },
      });

      if (terminated) {
        await tx.candidateSession.update({
          where: { id: sessionId },
          data: { status: "TERMINATED", submittedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            sessionId,
            type: "OTHER",
            severity: "CRITICAL",
            details: `Sesión terminada: ${MAX_STRIKES} strikes alcanzados`,
          },
        });
      }
      return { ok: true as const, flagCount: updated.flagCount, terminated, strike: isStrike };
    });
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo registrar la incidencia." };
  }
}

const HELP_REASONS: Record<string, string> = {
  TECH: "Problema técnico",
  QUESTION: "Duda sobre una pregunta",
  ZOOM: "Necesito revisar Zoom o el chat",
  OTHER: "Otro motivo",
};
const HELP_COOLDOWN_MS = 60_000;

/** El candidato pide ayuda a la Junta sin salir del examen. Una solicitud pendiente a la vez y una por minuto. */
export async function requestHelp(sessionId: string, reason: string, note?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const label = HELP_REASONS[reason];
  if (!label) return { ok: false, error: "Elige un motivo." };
  const text = note?.trim().slice(0, 200) ?? "";
  try {
    const s = await prisma.candidateSession.findUnique({ where: { id: sessionId }, select: { status: true, helpRequestedAt: true } });
    if (!s || s.status !== "IN_PROGRESS") return { ok: false, error: "La sesión no está activa." };
    if (s.helpRequestedAt && Date.now() - s.helpRequestedAt.getTime() < HELP_COOLDOWN_MS)
      return { ok: false, error: "Ya enviaste una solicitud hace un momento. La Junta la verá enseguida; habla por el micrófono si es urgente." };
    const detail = text ? `${label}: ${text}` : label;
    await prisma.$transaction([
      prisma.candidateSession.update({ where: { id: sessionId }, data: { helpRequestedAt: new Date(), helpNote: detail } }),
      prisma.auditLog.create({ data: { sessionId, type: "HELP_REQUEST", severity: "INFO", details: detail } }),
    ]);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo enviar la solicitud. Habla por el micrófono." };
  }
}

/** Estado de la ayuda para el candidato: si hay una salida autorizada vigente y si su solicitud sigue pendiente. */
export async function getHelpState(sessionId: string): Promise<{ ok: true; graceUntil: string | null; pending: boolean; serverNow: string; status: string; flagCount: number } | { ok: false }> {
  try {
    const s = await prisma.candidateSession.findUnique({ where: { id: sessionId }, select: { graceUntil: true, helpRequestedAt: true, status: true, flagCount: true } });
    if (!s) return { ok: false };
    const g = s.graceUntil && s.graceUntil.getTime() > Date.now() ? s.graceUntil.toISOString() : null;
    return { ok: true, graceUntil: g, pending: !!s.helpRequestedAt && s.status === "IN_PROGRESS", serverNow: new Date().toISOString(), status: s.status, flagCount: s.flagCount };
  } catch {
    return { ok: false };
  }
}

export type AnswerInput = { questionId: string; optionId?: string | null; text?: string | null };

export type SubmitResult =
  | { ok: true; late: boolean }
  | { ok: false; error: string };

/**
 * Guarda las respuestas (bulk insert), califica las de opción múltiple y marca la
 * sesión como SUBMITTED. Si llega fuera del margen de tiempo, la sesión se cierra
 * pero las respuestas se descartan.
 */
export async function submitExam(sessionId: string, answers: AnswerInput[]): Promise<SubmitResult> {
  try {
    const session = await prisma.candidateSession.findUnique({
      where: { id: sessionId },
      include: {
        exam: {
          select: {
            durationMinutes: true,
            questions: { select: { id: true, points: true, options: { select: { id: true, isCorrect: true } } } },
          },
        },
      },
    });
    if (!session) return { ok: false, error: "Sesión no encontrada." };
    if (session.status !== "IN_PROGRESS" || !session.startedAt)
      return { ok: false, error: "La sesión no está activa." };

    const now = Date.now();
    const deadline = session.startedAt.getTime() + session.exam.durationMinutes * 60_000;
    const late = now > deadline + SUBMIT_GRACE_MS;

    const questions = new Map(session.exam.questions.map((q) => [q.id, q]));
    const rows: { sessionId: string; questionId: string; selectedOptionId: string | null; textResponse: string | null }[] = [];
    const seen = new Set<string>();
    let score = 0;

    if (!late) {
      for (const a of answers ?? []) {
        const q = questions.get(a.questionId);
        if (!q || seen.has(q.id)) continue;
        const option = a.optionId ? q.options.find((o) => o.id === a.optionId) : undefined;
        const text = a.text?.trim().slice(0, 5000) || null;
        if (!option && !text) continue;
        seen.add(q.id);
        if (option?.isCorrect) score += q.points;
        rows.push({
          sessionId,
          questionId: q.id,
          selectedOptionId: option?.id ?? null,
          textResponse: option ? null : text,
        });
      }
    }

    await prisma.$transaction([
      prisma.answer.deleteMany({ where: { sessionId } }),
      prisma.answer.createMany({ data: rows }),
      prisma.candidateSession.update({
        where: { id: sessionId },
        data: { status: "SUBMITTED", submittedAt: new Date(now), score: late ? 0 : score },
      }),
      prisma.auditLog.create({
        data: {
          sessionId,
          type: "SESSION_SUBMIT",
          severity: late ? "WARNING" : "INFO",
          details: late ? "Entrega fuera de tiempo; respuestas descartadas" : `${rows.length} respuestas guardadas`,
        },
      }),
    ]);
    return { ok: true, late };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo entregar el examen." };
  }
}

export type SaveProgressResult = { ok: true } | { ok: false; error: string };

/**
 * Autosave: upsert atómico sobre el índice único (sessionId, questionId) de Answer.
 * Una sola sentencia por guardado, sin lecturas-modificaciones-escrituras, así que es seguro
 * ante guardados concurrentes (p. ej. dos pestañas o reintentos). Un valor vacío borra la respuesta.
 */
export async function saveProgress(
  sessionId: string,
  questionId: string,
  answerValue: { optionId?: string | null; text?: string | null },
): Promise<SaveProgressResult> {
  try {
    const session = await prisma.candidateSession.findUnique({
      where: { id: sessionId },
      select: { status: true, startedAt: true, exam: { select: { durationMinutes: true } } },
    });
    if (!session || session.status !== "IN_PROGRESS" || !session.startedAt)
      return { ok: false, error: "La sesión no está activa." };
    if (Date.now() > session.startedAt.getTime() + session.exam.durationMinutes * 60_000 + SUBMIT_GRACE_MS)
      return { ok: false, error: "El tiempo del examen terminó." };

    const question = await prisma.question.findFirst({
      where: { id: questionId, exam: { sessions: { some: { id: sessionId } } } },
      select: { type: true, options: { select: { id: true } } },
    });
    if (!question) return { ok: false, error: "Pregunta inválida." };

    const optionId =
      question.type === "MULTIPLE_CHOICE" && answerValue.optionId
        ? (question.options.find((o) => o.id === answerValue.optionId)?.id ?? null)
        : null;
    const text =
      question.type === "TEXT" ? answerValue.text?.trim().slice(0, 5000) || null : null;

    if (!optionId && !text) {
      await prisma.answer.deleteMany({ where: { sessionId, questionId } });
      return { ok: true };
    }

    await prisma.answer.upsert({
      where: { sessionId_questionId: { sessionId, questionId } },
      create: { sessionId, questionId, selectedOptionId: optionId, textResponse: text },
      update: { selectedOptionId: optionId, textResponse: text, answeredAt: new Date() },
    });
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo guardar el progreso." };
  }
}
