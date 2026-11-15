"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Timer } from "lucide-react";
import { saveProgress, submitExam, type AnswerInput } from "@/actions/proctor";
import { useProctor } from "@/components/proctor/ProctorWrapper";

export type ExamQuestion = {
  id: string;
  text: string;
  type: "MULTIPLE_CHOICE" | "TEXT";
  imageUrl: string | null;
  points: number;
  options: { id: string; text: string }[];
};

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export default function ExamForm({
  sessionId,
  examTitle,
  questions,
  initialChoices,
  initialTexts,
}: {
  sessionId: string;
  examTitle: string;
  questions: ExamQuestion[];
  /** Respuestas ya guardadas (hidratación tras recargar). */
  initialChoices: Record<string, string>;
  initialTexts: Record<string, string>;
}) {
  const { deadlineMs, clockOffsetMs, strikes, finish } = useProctor();
  const [choices, setChoices] = useState<Record<string, string>>(initialChoices);
  const [texts, setTexts] = useState<Record<string, string>>(initialTexts);
  const [remaining, setRemaining] = useState(() => deadlineMs - (Date.now() + clockOffsetMs));
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ late: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const submittedRef = useRef(false);
  const answersRef = useRef({ choices: initialChoices, texts: initialTexts });

  // ───────────── Autosave silencioso ─────────────
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const versions = useRef<Record<string, number>>({});
  const dirty = useRef<Set<string>>(new Set());

  const flush = useCallback(
    async function run(qid: string) {
      if (submittedRef.current) return;
      const v = versions.current[qid] ?? 0;
      const { choices: c, texts: t } = answersRef.current;
      setSaveStatus("saving");
      let ok = false;
      try {
        const res = await saveProgress(sessionId, qid, { optionId: c[qid] ?? null, text: t[qid] ?? null });
        ok = res.ok;
      } catch {
        ok = false; // sin conexión
      }
      if (submittedRef.current) return;
      if (ok) {
        if ((versions.current[qid] ?? 0) === v) dirty.current.delete(qid);
        setSaveStatus(dirty.current.size === 0 ? "saved" : "saving");
      } else {
        setSaveStatus("error");
        clearTimeout(timers.current[qid]);
        timers.current[qid] = setTimeout(() => void run(qid), 5000); // reintento
      }
    },
    [sessionId],
  );

  const scheduleSave = useCallback(
    (qid: string) => {
      versions.current[qid] = (versions.current[qid] ?? 0) + 1;
      dirty.current.add(qid);
      clearTimeout(timers.current[qid]);
      timers.current[qid] = setTimeout(() => void flush(qid), 2000);
    },
    [flush],
  );

  const selectOption = (qid: string, optionId: string) => {
    answersRef.current = { ...answersRef.current, choices: { ...answersRef.current.choices, [qid]: optionId } };
    setChoices(answersRef.current.choices);
    scheduleSave(qid);
  };
  const changeText = (qid: string, value: string) => {
    answersRef.current = { ...answersRef.current, texts: { ...answersRef.current.texts, [qid]: value } };
    setTexts(answersRef.current.texts);
    scheduleSave(qid);
  };

  // Al recuperar la conexión, reintenta de inmediato lo pendiente; al desmontar, limpia temporizadores.
  useEffect(() => {
    const pending = timers.current;
    const onOnline = () => dirty.current.forEach((qid) => void flush(qid));
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      Object.values(pending).forEach(clearTimeout);
    };
  }, [flush]);

  const doSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    Object.values(timers.current).forEach(clearTimeout);
    setSubmitting(true);
    setError(null);
    const { choices: c, texts: t } = answersRef.current;
    const answers: AnswerInput[] = questions.map((q) => ({
      questionId: q.id,
      optionId: q.type === "MULTIPLE_CHOICE" ? (c[q.id] ?? null) : null,
      text: q.type === "TEXT" ? (t[q.id] ?? null) : null,
    }));
    const res = await submitExam(sessionId, answers);
    if (!res.ok) {
      submittedRef.current = false;
      setSubmitting(false);
      setError(res.error);
      return;
    }
    setDone({ late: res.late });
    finish();
  }, [questions, sessionId, finish]);

  // Temporizador basado en la hora del servidor; autoentrega al llegar a 0.
  useEffect(() => {
    if (done) return;
    const tick = () => {
      const left = deadlineMs - (Date.now() + clockOffsetMs);
      setRemaining(left);
      if (left <= 0) void doSubmit();
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [deadlineMs, clockOffsetMs, done, doSubmit]);

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center">
          <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-emerald-500" />
          <h1 className="text-2xl font-bold text-slate-900">Examen entregado</h1>
          <p className="mt-2 text-slate-600">
            {done.late
              ? "Tu entrega llegó fuera del tiempo permitido y no pudo ser registrada."
              : "Tus respuestas fueron guardadas. Ya puedes cerrar esta ventana."}
          </p>
        </div>
      </div>
    );
  }

  const answered = questions.filter((q) =>
    q.type === "MULTIPLE_CHOICE" ? !!choices[q.id] : !!texts[q.id]?.trim(),
  ).length;
  const low = remaining < 5 * 60_000;

  return (
    <div className="bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate font-semibold">{examTitle}</h1>
            <p className="text-xs text-slate-500">
              {answered}/{questions.length} respondidas · Infracciones {strikes}/3
              {saveStatus !== "idle" && (
                <span
                  className={`ml-2 ${saveStatus === "error" ? "font-semibold text-red-600" : "text-slate-400"}`}
                  aria-live="polite"
                >
                  {saveStatus === "saving" && "· Guardando…"}
                  {saveStatus === "saved" && (
                    <span className="inline-flex items-center gap-1">
                      · <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> Progreso guardado
                    </span>
                  )}
                  {saveStatus === "error" && "· Sin conexión: reintentando…"}
                </span>
              )}
            </p>
          </div>
          <div
            className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-lg font-bold tabular-nums ${
              low ? "bg-red-100 text-red-700" : "bg-blue-50 text-blue-700"
            }`}
            aria-live="off"
          >
            <Timer className="h-5 w-5" /> {fmt(remaining)}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        {questions.map((q, i) => (
          <section key={q.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
              Pregunta {i + 1} · {q.points} pt{q.points > 1 ? "s" : ""}
            </p>
            <h2 className="whitespace-pre-wrap font-medium">{q.text}</h2>
            {q.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={q.imageUrl}
                alt={`Imagen de la pregunta ${i + 1}`}
                draggable={false}
                className="mt-4 max-h-72 rounded-lg border border-slate-200 object-contain"
              />
            )}

            {q.type === "MULTIPLE_CHOICE" ? (
              <div className="mt-4 space-y-2" role="radiogroup">
                {q.options.map((o) => (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                      choices[q.id] === o.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={choices[q.id] === o.id}
                      onChange={() => selectOption(q.id, o.id)}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <span className="text-sm">{o.text}</span>
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                rows={5}
                value={texts[q.id] ?? ""}
                onChange={(e) => changeText(q.id, e.target.value)}
                placeholder="Escribe tu respuesta…"
                className="mt-4 w-full select-text rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            )}
          </section>
        ))}

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="flex justify-end pb-10">
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-xl bg-asigbo-blue px-8 py-3 font-semibold text-white shadow transition-colors hover:bg-asigbo-blue-dark"
            >
              Entregar examen
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <span className="text-sm text-amber-900">
                {questions.length - answered === 0
                  ? "Respondiste todas las preguntas. ¿Entregar el examen ahora?"
                  : `Te falta${questions.length - answered === 1 ? "" : "n"} ${questions.length - answered} pregunta${questions.length - answered === 1 ? "" : "s"} por responder. ¿Entregar de todos modos?`}
              </span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={submitting}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void doSubmit()}
                disabled={submitting}
                className="rounded-lg bg-asigbo-blue px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? "Enviando…" : "Confirmar"}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
