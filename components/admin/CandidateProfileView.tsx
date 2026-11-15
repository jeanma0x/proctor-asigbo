"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, FileText, Loader2, Pencil, Send, Trash2 } from "lucide-react";
import { addNote, deleteNote, updateCandidate, type CandidateProfile } from "@/actions/candidates";
import { setDecision } from "@/actions/ranking";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/admin/ui";
import { DECISION } from "@/components/admin/CandidatesExplorer";
import { fmtDateTime, initials } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/labels";

type Decision = "SELECTED" | "WAITLIST" | "NOT_SELECTED" | null;
type P = Omit<CandidateProfile, "createdAt" | "sessions" | "notes" | "history"> & {
  createdAt: string;
  history: (Omit<CandidateProfile["history"][number], "createdAt"> & { createdAt: string })[];
  sessions: (Omit<CandidateProfile["sessions"][number], "startedAt" | "submittedAt" | "decidedAt"> & { startedAt: string | null; submittedAt: string | null; decidedAt: string | null })[];
  notes: (Omit<CandidateProfile["notes"][number], "createdAt"> & { createdAt: string })[];
};

export default function CandidateProfileView({ p, meId, isSuper, canDecide, canGrade, canEdit, canExport }: { p: P; meId: string; isSuper: boolean; canDecide: boolean; canGrade: boolean; canEdit: boolean; canExport: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.fullName);
  const [email, setEmail] = useState(p.email);
  const [note, setNote] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "No se pudo completar la acción.");
      after?.();
      router.refresh();
    });
  };

  const best = p.sessions.filter((s) => s.score != null && s.maxScore).map((s) => (s.score! / s.maxScore) * 100);
  const bestPct = best.length ? Math.max(...best) : null;
  const pendingTotal = p.sessions.reduce((n, s) => n + s.pendingGrade, 0);

  return (
    <div className="space-y-6">
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}</div>}

      <header className={`${card} p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-asigbo-blue text-xl font-bold text-white">{initials(p.fullName, p.email)}</span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{p.fullName}</h1>
              <p className="text-sm text-slate-600">{p.email}{p.studentId ? ` · Carné ${p.studentId}` : ""}</p>
              <p className="text-xs text-slate-500">Registrado el {fmtDateTime(p.createdAt)}</p>
            </div>
          </div>
          {canEdit && !editing && <button type="button" onClick={() => setEditing(true)} className={btnGhost}><Pencil className="h-4 w-4" aria-hidden="true" /> Corregir datos</button>}
        </div>
        {editing && (
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); run(() => updateCandidate(p.id, { fullName: name, email }), () => setEditing(false)); }} className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <div><label htmlFor="cp-name" className="text-xs font-medium text-slate-700">Nombre</label><input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mt-1`} /></div>
            <div><label htmlFor="cp-email" className="text-xs font-medium text-slate-700">Correo</label><input id="cp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} mt-1`} /></div>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" disabled={pending} className={btnPrimary}>{pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Guardar</button>
              <button type="button" onClick={() => { setEditing(false); setName(p.fullName); setEmail(p.email); }} className={btnGhost}>Cancelar</button>
            </div>
          </form>
        )}
        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          {[["Participaciones", String(p.sessions.length)], ["Mejor resultado", bestPct == null ? "—" : `${Math.round(bestPct)}%`], ["Por calificar", String(pendingTotal)]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt><dd className="mt-0.5 text-xl font-bold tabular-nums">{v}</dd></div>
          ))}
        </dl>
      </header>

      <section aria-label="Historial de participaciones" className="space-y-4">
        <h2 className="font-semibold">Historial de participaciones</h2>
        {p.sessions.length === 0 && <p className={`${card} p-6 text-sm text-slate-600`}>Esta persona aún no ha iniciado ningún examen.</p>}
        {p.sessions.map((s) => {
          const pct = s.score != null && s.maxScore ? Math.round((s.score / s.maxScore) * 100) : null;
          return (
            <article key={s.id} className={`${card} p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-asigbo-blue">{s.convocatoria ?? "Sin convocatoria"}</p>
                  <h3 className="mt-0.5 text-lg font-semibold">{s.examTitle}</h3>
                  <p className="text-xs text-slate-500">Entrega: {fmtDateTime(s.submittedAt)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS_LABEL[s.status].cls}`}>{STATUS_LABEL[s.status].label}</span>
              </div>
              <dl className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Puntaje</dt><dd className="font-semibold tabular-nums">{s.score == null ? "—" : `${s.score} / ${s.maxScore}${pct != null ? ` (${pct}%)` : ""}`}</dd></div>
                <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Posición</dt><dd className="font-semibold tabular-nums">{s.rank ? `${s.rank.position} de ${s.rank.of}` : "—"}</dd></div>
                <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Infracciones</dt><dd className={`font-semibold tabular-nums ${s.flagCount ? "text-red-700" : ""}`}>{s.flagCount}</dd></div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">Decisión</dt>
                  <dd>
                    {canDecide && s.status !== "IN_PROGRESS" ? (
                      <select aria-label={`Decisión para ${s.examTitle}`} value={s.decision ?? ""} disabled={pending} onChange={(e) => run(() => setDecision(s.id, (e.target.value || null) as Decision))} className="mt-0.5 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-medium">
                        <option value="">Sin decidir</option><option value="SELECTED">Seleccionado</option><option value="WAITLIST">Lista de espera</option><option value="NOT_SELECTED">No seleccionado</option>
                      </select>
                    ) : s.decision ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${DECISION[s.decision].cls}`}>{DECISION[s.decision].label}</span> : <span className="text-sm text-slate-400">Sin decidir</span>}
                    {s.decision && s.decidedBy && <p className="mt-1 text-xs text-slate-500">por {s.decidedBy.split("@")[0]} · {fmtDateTime(s.decidedAt)}</p>}
                  </dd>
                </div>
              </dl>
              {s.pendingGrade > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{s.pendingGrade} respuesta(s) abierta(s) por calificar.</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/admin/results/${s.id}`} className={btnGhost}>{canGrade && s.pendingGrade > 0 ? "Ver y calificar respuestas" : "Ver respuestas"}</Link>
                {canExport && <a href={`/admin/reports/candidate/${s.id}/pdf`} className={btnGhost}><FileText className="h-4 w-4" aria-hidden="true" /> Informe PDF</a>}
              </div>
            </article>
          );
        })}
      </section>

      <section aria-label="Notas internas" className={`${card} p-6`}>
        <h2 className="font-semibold">Notas internas</h2>
        <p className="mb-4 text-sm text-slate-600">Visibles solo para la Junta. Quedan guardadas en el historial de la persona entre convocatorias.</p>
        {canGrade && (
          <form onSubmit={(e) => { e.preventDefault(); run(() => addNote(p.id, note), () => setNote("")); }} className="mb-5 flex gap-2">
            <label htmlFor="cp-note" className="sr-only">Nueva nota</label>
            <textarea id="cp-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Escribe una observación sobre el candidato…" className={`${inputCls} flex-1`} />
            <button type="submit" disabled={pending || !note.trim()} className={`${btnPrimary} self-end`}><Send className="h-4 w-4" aria-hidden="true" /> Guardar</button>
          </form>
        )}
        {p.notes.length === 0 ? <p className="text-sm text-slate-500">Aún no hay notas.</p> : (
          <ul className="space-y-3">
            {p.notes.map((n) => (
              <li key={n.id} className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-slate-500"><strong className="text-slate-700">{n.authorName}</strong> · {fmtDateTime(n.createdAt)}</p>
                  {canGrade && (n.authorId === meId || isSuper) && <button type="button" disabled={pending} onClick={() => run(() => deleteNote(n.id))} aria-label="Borrar nota" className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Historial de acciones" className={`${card} p-6`}>
        <h2 className="font-semibold">Historial de acciones</h2>
        <p className="mb-4 text-sm text-slate-600">Qué hizo la Junta sobre esta persona: decisiones, calificaciones, reinicios y correcciones.</p>
        {p.history.length === 0 ? <p className="text-sm text-slate-500">Aún no hay acciones registradas.</p> : (
          <ol className="space-y-2">
            {p.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="w-40 shrink-0 text-xs text-slate-500">{fmtDateTime(h.createdAt)}</span>
                <span className="font-medium text-slate-800">{h.who}</span>
                <span className="text-slate-700">{h.summary}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
