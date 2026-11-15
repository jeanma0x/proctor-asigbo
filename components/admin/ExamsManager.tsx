"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarClock, Copy, Loader2, Lock, Pencil, Plus, Shuffle, Trash2 } from "lucide-react";
import { deleteExam, duplicateExam, setExamStatus, type ExamListRow } from "@/actions/exams-admin";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/admin/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";

type Conv = { id: string; name: string; year: number };

const STATUS = {
  DRAFT: { label: "Borrador", cls: "bg-amber-100 text-amber-900" },
  PUBLISHED: { label: "Publicado", cls: "bg-emerald-100 text-emerald-800" },
  CLOSED: { label: "Cerrado", cls: "bg-slate-200 text-slate-700" },
} as const;

export default function ExamsManager({ exams, convocatorias }: { exams: ExamListRow[]; convocatorias: Conv[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ id: string; kind: "delete" | "duplicate" } | null>(null);
  const [target, setTarget] = useState("");
  const [ask, setAsk] = useState<{ exam: ExamListRow; to: "DRAFT" | "PUBLISHED" | "CLOSED" } | null>(null);
  const askText = (a: NonNullable<typeof ask>) => {
    const e = a.exam;
    if (a.to === "PUBLISHED") return { title: `${e.status === "CLOSED" ? "Reabrir" : "Publicar"} «${e.title}»`, label: e.status === "CLOSED" ? "Reabrir examen" : "Publicar examen", danger: false, body: `Los aspirantes habilitados podrán presentarlo con su enlace${e.opensAt || e.closesAt ? ", dentro de la ventana de fechas configurada" : ""}. Revisa que las preguntas y la duración (${e.durationMinutes} min) sean correctas: tras iniciar, las preguntas quedan bloqueadas.` };
    if (a.to === "CLOSED") return { title: `Cerrar «${e.title}»`, label: "Cerrar examen", danger: true, body: `Nadie podrá iniciarlo ni continuarlo, incluso quienes lo estén presentando ahora.${e.started > 0 ? ` ${e.started} aspirante(s) ya lo iniciaron.` : ""} Podrás reabrirlo después.` };
    return { title: `Volver «${e.title}» a borrador`, label: "Pasar a borrador", danger: true, body: "Los enlaces dejarán de funcionar hasta que lo publiques de nuevo." };
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "No se pudo completar la acción.");
      setPanel(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{exams.length} examen(es) registrados</p>
        <Link href="/admin/exam-builder" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> Nuevo examen</Link>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </div>
      )}

      <section className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Examen</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Contenido</th>
                <th className="px-4 py-3 font-semibold">Aspirantes</th>
                <th className="px-6 py-3"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {exams.length === 0 && <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">Aún no hay exámenes. Crea el primero con «Nuevo examen».</td></tr>}
              {exams.map((e) => {
                const open = panel?.id === e.id ? panel.kind : null;
                const locked = e.started > 0;
                return (
                  <tr key={e.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4">
                      <p className="font-semibold">{e.title}</p>
                      <p className="text-xs text-slate-500">{e.convocatoria ?? "Sin convocatoria"} · creado {fmtDate(e.createdAt)}</p>
                      {e.shuffleQuestions && <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500"><Shuffle className="h-3 w-3" aria-hidden="true" /> Preguntas en orden aleatorio</p>}
                      {(e.opensAt || e.closesAt) && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><CalendarClock className="h-3 w-3" aria-hidden="true" /> {e.opensAt ? `Abre ${fmtDateTime(e.opensAt)}` : "Abierto"}{e.closesAt ? ` · cierra ${fmtDateTime(e.closesAt)}` : ""}</p>}
                    </td>
                    <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[e.status].cls}`}>{STATUS[e.status].label}</span></td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-700">{e.questions} preguntas · {e.points} pts<br /><span className="text-xs text-slate-500">{e.durationMinutes} min</span></td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-700">
                      {e.sessions} habilitados<br />
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">{locked && <Lock className="h-3 w-3" aria-hidden="true" />}{e.started} han iniciado</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Link href={`/admin/exams/${e.id}/edit`} className={`${btnGhost} !px-3 !py-1.5 text-xs`}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar</Link>
                        <button type="button" disabled={pending} onClick={() => { setPanel({ id: e.id, kind: "duplicate" }); setTarget(convocatorias[0]?.id ?? ""); }} className={`${btnGhost} !px-3 !py-1.5 text-xs`}><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Duplicar</button>
                        {e.status === "DRAFT" && <button type="button" disabled={pending} onClick={() => setAsk({ exam: e, to: "PUBLISHED" })} className={`${btnPrimary} !px-3 !py-1.5 text-xs`}>Publicar</button>}
                        {e.status === "PUBLISHED" && <button type="button" disabled={pending} onClick={() => setAsk({ exam: e, to: "CLOSED" })} className={`${btnGhost} !px-3 !py-1.5 text-xs`}>Cerrar</button>}
                        {e.status === "CLOSED" && <button type="button" disabled={pending} onClick={() => setAsk({ exam: e, to: "PUBLISHED" })} className={`${btnGhost} !px-3 !py-1.5 text-xs`}>Reabrir</button>}
                        {e.status === "PUBLISHED" && !locked && <button type="button" disabled={pending} onClick={() => setAsk({ exam: e, to: "DRAFT" })} className={`${btnGhost} !px-3 !py-1.5 text-xs`}>A borrador</button>}
                        <button type="button" onClick={() => setPanel({ id: e.id, kind: "delete" })} disabled={pending || locked} title={locked ? "Tiene candidatos que lo iniciaron: se conserva el histórico" : "Eliminar examen"} aria-label={`Eliminar ${e.title}`} className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      {open === "delete" && (
                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                          <p>Se eliminará el examen y sus preguntas{e.sessions > 0 ? `, y se invalidarán ${e.sessions} enlace(s) que nadie ha usado` : ""}. No se puede deshacer.</p>
                          <div className="mt-2 flex justify-end gap-2">
                            <button type="button" onClick={() => setPanel(null)} className={`${btnGhost} !px-3 !py-1.5 text-xs`}>Cancelar</button>
                            <button type="button" disabled={pending} onClick={() => run(() => deleteExam(e.id))} className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                              {pending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />} Eliminar definitivamente
                            </button>
                          </div>
                        </div>
                      )}
                      {open === "duplicate" && (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                          <label htmlFor={`dup-${e.id}`} className="font-medium text-slate-700">Crear una copia (borrador) en la convocatoria:</label>
                          <select id={`dup-${e.id}`} value={target} onChange={(ev) => setTarget(ev.target.value)} className={`${inputCls} mt-1`}>
                            {convocatorias.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.year})</option>)}
                          </select>
                          <div className="mt-2 flex justify-end gap-2">
                            <button type="button" onClick={() => setPanel(null)} className={`${btnGhost} !px-3 !py-1.5 text-xs`}>Cancelar</button>
                            <button type="button" disabled={pending || !target} onClick={() => run(() => duplicateExam(e.id, target))} className={`${btnPrimary} !px-3 !py-1.5 text-xs`}>
                              {pending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />} Duplicar
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {ask && (() => { const t = askText(ask); return (
        <ConfirmDialog open title={t.title} description={t.body} confirmLabel={t.label} tone={t.danger ? "danger" : "primary"} busy={pending}
          onCancel={() => setAsk(null)} onConfirm={() => run(async () => { const r = await setExamStatus(ask.exam.id, ask.to); if (r.ok) setAsk(null); return r; })} />
      ); })()}
    </div>
  );
}
