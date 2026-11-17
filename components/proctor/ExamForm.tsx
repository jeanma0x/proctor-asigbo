"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, CheckCircle2, Clock, TriangleAlert } from "lucide-react";
import { saveProgress, submitExam, type AnswerInput } from "@/actions/proctor";
import { useProctor } from "@/components/proctor/ProctorWrapper";

export type ExamQuestion = {
  id: string;
  text: string;
  type: "MULTIPLE_CHOICE" | "TEXT";
  imageUrl: string | null;
  points: number;
  section: string | null;
  sectionNote: string | null;
  passage: string | null;
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
  candidateName,
  questions,
  initialChoices,
  initialTexts,
}: {
  sessionId: string;
  examTitle: string;
  candidateName: string;
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

  const firstName = candidateName.trim().split(/\s+/)[0] ?? candidateName;

  if (done) {
    return (
      <div className="min-h-screen bg-paper">
        <div className="flex h-1.5" aria-hidden="true"><span className="flex-1 bg-asigbo-blue" /><span className="flex-1 bg-asigbo-cyan" /><span className="flex-1 bg-asigbo-green" /><span className="flex-1 bg-asigbo-orange" /></div>
        <div className="mx-auto max-w-lg px-6 py-20 text-center">
          <span className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-9 w-9" aria-hidden="true" /></span>
          <h1 className="font-serif text-3xl font-semibold text-slate-900">
            {done.late ? "Se acabó el tiempo" : `Listo, ${firstName}. Entregaste tu examen.`}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-700">
            {done.late
              ? "Tu entrega llegó fuera del tiempo permitido y no pudo registrarse."
              : "Tus respuestas quedaron guardadas. Gracias por tu esfuerzo."}
          </p>
          <p className="mt-3 text-base text-slate-600">La Junta Directiva comunicará los resultados. Ya puedes cerrar esta ventana.</p>
          <div className="mt-10 flex justify-center"><Image alt="ASIGBO" src="/logo-asigbo.png" width={150} height={46} className="h-10 w-auto" /></div>
        </div>
      </div>
    );
  }

  const isAnswered = (q: ExamQuestion) => (q.type === "MULTIPLE_CHOICE" ? !!choices[q.id] : !!texts[q.id]?.trim());
  const answered = questions.filter(isAnswered).length;
  const missing = questions.map((q, i) => (isAnswered(q) ? null : i + 1)).filter((n): n is number => n !== null);
  const low = remaining < 5 * 60_000;
  const critical = remaining < 60_000;
  const progress = questions.length ? (answered / questions.length) * 100 : 0;
  const letters = "ABCDEFGH";

  const goTo = (id: string) => {
    const el = document.getElementById(`q-${id}`);
    el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el?.focus({ preventScroll: true });
  };

  const Navigator = (
    <nav aria-label="Navegador de preguntas">
      <div className="flex flex-wrap gap-2">
        {questions.map((q, i) => (
          <button
            key={q.id}
            type="button"
            onClick={() => goTo(q.id)}
            aria-label={`Ir a la pregunta ${i + 1}${isAnswered(q) ? " (respondida)" : " (sin responder)"}`}
            className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue ${
              isAnswered(q) ? "border-asigbo-blue bg-asigbo-blue text-white" : "border-slate-300 bg-white text-slate-700 hover:border-asigbo-blue"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-asigbo-blue" /> Respondida</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-slate-400 bg-white" /> Pendiente</span>
      </p>
    </nav>
  );

  return (
    <div className="min-h-screen bg-paper text-slate-900">
      <div className="flex h-1.5" aria-hidden="true"><span className="flex-1 bg-asigbo-blue" /><span className="flex-1 bg-asigbo-cyan" /><span className="flex-1 bg-asigbo-green" /><span className="flex-1 bg-asigbo-orange" /></div>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Image alt="ASIGBO" src="/logo-asigbo.png" width={120} height={37} className="hidden h-8 w-auto sm:block" />
            <div className="min-w-0">
              <h1 className="truncate font-serif text-lg font-semibold">{examTitle}</h1>
              <p className="text-sm text-slate-600" aria-live="polite">
                {saveStatus === "saving" && "Guardando…"}
                {saveStatus === "saved" && <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Progreso guardado</span>}
                {saveStatus === "error" && <span className="font-semibold text-red-700">Sin conexión: reintentando…</span>}
                {saveStatus === "idle" && `${answered} de ${questions.length} respondidas`}
              </p>
            </div>
          </div>
          <div
            role="timer"
            aria-label={`Tiempo restante ${fmt(remaining)}`}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 font-mono text-xl font-bold tabular-nums ${
              critical ? "border-red-300 bg-red-50 text-red-800" : low ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-900"
            }`}
          >
            <Clock className="h-5 w-5" aria-hidden="true" /> {fmt(remaining)}
          </div>
        </div>
        <div className="h-1 bg-slate-100" role="progressbar" aria-label="Avance del examen" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <div className="h-full bg-asigbo-green transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
        </div>
        {low && (
          <p role="status" className={`px-4 py-1.5 text-center text-sm font-semibold ${critical ? "bg-red-600 text-white" : "bg-amber-100 text-amber-950"}`}>
            {critical ? "Queda menos de un minuto." : "Quedan menos de 5 minutos."} Tus respuestas se guardan automáticamente.
          </p>
        )}
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_16rem]">
        <main className="min-w-0 space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:hidden">{Navigator}</div>

          {questions.map((q, i) => (
            <Fragment key={q.id}>
            {(q.section || q.passage || q.sectionNote) && (i === 0 || (questions[i - 1].section ?? "") !== (q.section ?? "")) && (
              <section aria-label={q.section ?? "Texto de lectura"} className="mt-4 rounded-2xl border border-asigbo-blue/20 bg-white p-6 sm:p-8">
                {q.section && <h2 className="font-serif text-2xl font-semibold text-asigbo-blue">{q.section}</h2>}
                {q.sectionNote && <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-slate-700">{q.sectionNote}</p>}
                {q.passage && <div className="mt-4 whitespace-pre-wrap rounded-xl bg-paper p-5 font-serif text-lg leading-loose text-slate-900">{q.passage}</div>}
              </section>
            )}
            <section id={`q-${q.id}`} tabIndex={-1} aria-labelledby={`qt-${q.id}`} className="scroll-mt-32 rounded-2xl border border-slate-200 bg-white p-6 outline-none focus-visible:ring-2 focus-visible:ring-asigbo-blue sm:p-8">
              <div className="flex items-start gap-4">
                <span className="font-serif text-4xl font-semibold leading-none text-asigbo-blue" aria-hidden="true">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-600">Pregunta {i + 1} de {questions.length} · {q.points} punto{q.points > 1 ? "s" : ""}</p>
                  <h2 id={`qt-${q.id}`} className="mt-1 whitespace-pre-wrap text-lg font-medium leading-relaxed text-slate-900">{q.text}</h2>
                </div>
              </div>
              {q.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={q.imageUrl} alt={`Imagen de la pregunta ${i + 1}`} draggable={false} className="mt-5 max-h-80 rounded-lg border border-slate-200 object-contain" />
              )}

              {q.type === "MULTIPLE_CHOICE" ? (
                <div className="mt-5 space-y-2.5" role="radiogroup" aria-labelledby={`qt-${q.id}`}>
                  {q.options.map((o, k) => {
                    const on = choices[q.id] === o.id;
                    return (
                      <label key={o.id} className={`flex min-h-12 cursor-pointer items-center gap-3.5 rounded-xl border-2 px-4 py-3 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-asigbo-blue ${on ? "border-asigbo-blue bg-asigbo-blue/5" : "border-slate-200 hover:border-slate-400"}`}>
                        <input type="radio" name={q.id} checked={on} onChange={() => selectOption(q.id, o.id)} className="sr-only" />
                        <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${on ? "border-asigbo-blue bg-asigbo-blue text-white" : "border-slate-300 text-slate-600"}`}>{letters[k] ?? k + 1}</span>
                        <span className="text-base leading-snug text-slate-900">{o.text}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5">
                  <textarea
                    rows={6}
                    value={texts[q.id] ?? ""}
                    onChange={(e) => changeText(q.id, e.target.value)}
                    aria-labelledby={`qt-${q.id}`}
                    placeholder="Escribe tu respuesta aquí…"
                    className="w-full select-text rounded-xl border-2 border-slate-300 p-4 text-base leading-relaxed outline-none focus:border-asigbo-blue focus-visible:ring-2 focus-visible:ring-asigbo-blue/30"
                  />
                  <p className="mt-1 text-right text-xs text-slate-500">{(texts[q.id] ?? "").length} caracteres</p>
                </div>
              )}
            </section>
            </Fragment>
          ))}

          {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-900">{error}</p>}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="font-serif text-2xl font-semibold">¿Terminaste?</h2>
            <p className="mt-2 text-base leading-relaxed text-slate-700">
              {missing.length === 0 ? "Respondiste todas las preguntas. Revisa si quieres y entrega cuando estés listo(a)." : `Aún te faltan por responder: ${missing.join(", ")}.`}
            </p>
            <button type="button" onClick={() => setConfirming(true)} className="mt-5 min-h-12 cursor-pointer rounded-xl bg-asigbo-blue px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-asigbo-blue-dark focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue">
              Entregar examen
            </button>
          </section>
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-32 space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-serif text-lg font-semibold">Tu avance</h2>
              <p className="mt-1 text-sm text-slate-600">{answered} de {questions.length} respondidas</p>
              <div className="mt-4">{Navigator}</div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-serif text-lg font-semibold">Advertencias</h2>
              <div className="mt-3 flex items-center gap-2" aria-label={`${strikes} de 3 advertencias`}>
                {[0, 1, 2].map((n) => <span key={n} className={`h-2.5 flex-1 rounded-full ${n < strikes ? "bg-amber-500" : "bg-slate-200"}`} />)}
                <span className="text-sm font-semibold tabular-nums text-slate-700">{strikes}/3</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">Salir de pantalla completa o cambiar de pestaña suma una advertencia.</p>
            </section>
          </div>
        </aside>
      </div>

      {confirming && (
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
            {missing.length > 0 && <TriangleAlert className="mb-3 h-9 w-9 text-amber-600" aria-hidden="true" />}
            <h2 id="confirm-title" className="font-serif text-2xl font-semibold text-slate-900">¿Entregar el examen?</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-700">
              {missing.length === 0
                ? "Respondiste todas las preguntas. Después de entregar no podrás cambiar tus respuestas."
                : `Te falta${missing.length === 1 ? "" : "n"} ${missing.length} pregunta${missing.length === 1 ? "" : "s"} por responder (${missing.join(", ")}). Después de entregar no podrás cambiar tus respuestas.`}
            </p>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setConfirming(false)} disabled={submitting} autoFocus className="min-h-12 cursor-pointer rounded-xl border-2 border-slate-300 px-6 py-3 text-base font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue">
                Seguir revisando
              </button>
              <button type="button" onClick={() => void doSubmit()} disabled={submitting} className="min-h-12 cursor-pointer rounded-xl bg-asigbo-blue px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-asigbo-blue-dark focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue disabled:opacity-60">
                {submitting ? "Enviando…" : "Sí, entregar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
