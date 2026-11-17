"use client";

import { useState } from "react";
import { Check, CircleHelp, X } from "lucide-react";
import GradeControl from "@/components/admin/GradeControl";
import { card } from "@/components/admin/ui";
import type { QuestionResult } from "@/actions/results";

type Filter = "all" | "wrong" | "open";

/** Respuestas pregunta por pregunta, con filtros (todas / falladas o sin responder / abiertas) y calificación de abiertas. */
export default function AnswerReview({ sessionId, questions, canGrade }: { sessionId: string; questions: QuestionResult[]; canGrade: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const wrong = questions.filter((q) => q.type === "MULTIPLE_CHOICE" && (!q.answered || !q.correct));
  const open = questions.filter((q) => q.type === "TEXT");
  const shown = filter === "wrong" ? wrong : filter === "open" ? open : questions;
  const chips: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "Todas", n: questions.length },
    { key: "wrong", label: "Falladas o sin responder", n: wrong.length },
    ...(open.length ? [{ key: "open" as const, label: "Abiertas", n: open.length }] : []),
  ];

  return (
    <section aria-label="Respuestas">
      <div role="tablist" aria-label="Filtrar respuestas" className="mb-4 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button key={c.key} type="button" role="tab" aria-selected={filter === c.key} onClick={() => setFilter(c.key)}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${filter === c.key ? "border-asigbo-blue bg-asigbo-blue text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
            {c.label} <span className="ml-1 tabular-nums opacity-80">{c.n}</span>
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {shown.length === 0 && <p className={`${card} p-6 text-sm text-slate-600`}>No hay preguntas con este filtro.</p>}
        {shown.map((q) => (
          <article key={q.id} className={`${card} p-5 sm:p-6`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pregunta {q.number} · {q.points} pt</p>
                <h3 className="mt-1 font-semibold">{q.text}</h3>
              </div>
              {q.type === "MULTIPLE_CHOICE" ? (
                <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${!q.answered ? "bg-slate-100 text-slate-700" : q.correct ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                  {!q.answered ? <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" /> : q.correct ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
                  {!q.answered ? "Sin responder" : q.correct ? `Correcta +${q.earned}` : "Incorrecta"}
                </span>
              ) : (
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${q.graded && q.answered ? "bg-emerald-100 text-emerald-800" : q.answered ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
                  {!q.answered ? "Sin responder" : q.graded ? `Calificada ${q.earned} / ${q.points}` : "Pendiente de calificar"}
                  {q.answered && q.graded && q.gradedBy ? <span className="ml-1 font-normal opacity-80">· por {q.gradedBy.split("@")[0]}</span> : null}
                </span>
              )}
            </div>
            {q.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={q.imageUrl} alt={`Imagen de la pregunta ${q.number}`} className="mt-3 max-h-48 rounded-lg border border-slate-200 object-contain" />
            )}
            {q.type === "MULTIPLE_CHOICE" ? (
              <ul className="mt-4 space-y-2">
                {q.options.map((o) => (
                  <li key={o.id} className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm ${o.selected && o.isCorrect ? "border-emerald-300 bg-emerald-50" : o.selected ? "border-red-300 bg-red-50" : o.isCorrect ? "border-emerald-200 bg-white" : "border-slate-200"}`}>
                    <span>{o.text}</span>
                    <span className="flex shrink-0 gap-2 text-xs font-semibold">
                      {o.selected && <span className="text-slate-700">Su respuesta</span>}
                      {o.isCorrect && <span className="text-emerald-700">Correcta</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <blockquote className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-800">
                {q.textResponse?.trim() || <span className="text-slate-500">Sin responder</span>}
              </blockquote>
            )}
            {q.type === "TEXT" && q.answered && canGrade && <GradeControl sessionId={sessionId} questionId={q.id} points={q.points} current={q.manualScore} />}
          </article>
        ))}
      </div>
    </section>
  );
}
