"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, ArrowRight, Flag, MessageSquare, PlayCircle, Search, Trophy } from "lucide-react";
import { getEvaluationBoard } from "@/actions/evaluation";
import type { RankingExam } from "@/actions/ranking";
import { SkeletonRows } from "@/components/admin/skeletons";
import { VOTES } from "@/components/admin/EvaluationPanel";
import { card, inputCls } from "@/components/admin/ui";

const SHORT: Record<string, string> = { SELECTED: "Selecc.", WAITLIST: "En espera", NOT_SELECTED: "No selecc." };
const chip = (v: string | null) => VOTES.find((x) => x.key === v);

export default function EvaluationBoard({ exams, initialExamId, canDecide }: { exams: RankingExam[]; initialExamId?: string; canDecide: boolean }) {
  const [examId, setExamId] = useState(exams.find((e) => e.id === initialExamId)?.id ?? exams[0]?.id ?? "");
  const [onlyPending, setOnlyPending] = useState(false);
  const [q, setQ] = useState("");
  const { data, isLoading } = useSWR(examId ? ["eval-board", examId] : null, () => getEvaluationBoard(examId), { keepPreviousData: true, refreshInterval: 15000 });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const mineDone = rows.filter((r) => r.myVote).length;
  const decided = rows.filter((r) => r.decision).length;
  const nextPending = rows.find((r) => !r.myVote);
  const query = q.trim().toLowerCase();
  const shown = useMemo(() => rows.filter((r) => (!onlyPending || !r.myVote) && (!query || r.name.toLowerCase().includes(query) || r.email.toLowerCase().includes(query))), [rows, onlyPending, query]);

  if (exams.length === 0) return <div className={`${card} p-8 text-center text-sm text-slate-600`}>Aún no hay exámenes con entregas para evaluar. Cuando los aspirantes terminen, aparecerán aquí.</div>;

  return (
    <div className="space-y-6">
      <section className={`${card} p-5`}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-64 flex-1">
            <label htmlFor="ev-exam" className="text-sm font-medium text-slate-700">Examen</label>
            <select id="ev-exam" value={examId} onChange={(e) => setExamId(e.target.value)} className={`${inputCls} mt-1`}>
              {exams.map((e) => <option key={e.id} value={e.id}>{e.convocatoria ? `${e.convocatoria} · ` : ""}{e.title} ({e.entregados} entregas)</option>)}
            </select>
          </div>
          {nextPending && (
            <Link href={`/admin/evaluation/${nextPending.sessionId}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-asigbo-blue px-5 text-sm font-semibold text-white shadow-sm hover:bg-asigbo-blue-dark">
              <PlayCircle className="h-5 w-5" aria-hidden="true" /> {mineDone ? "Continuar evaluando" : "Empezar a evaluar"}
            </Link>
          )}
        </div>
        {rows.length > 0 && (
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-slate-600">Tu avance</p>
              <p className="text-2xl font-bold tabular-nums">{mineDone} <span className="text-base font-medium text-slate-500">de {rows.length}</span></p>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Tu avance" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={mineDone}><div className="h-full rounded-full bg-asigbo-green" style={{ width: `${(mineDone / rows.length) * 100}%` }} /></div>
            </div>
            <div><p className="text-sm text-slate-600">Con decisión final</p><p className="text-2xl font-bold tabular-nums">{decided} <span className="text-base font-medium text-slate-500">de {rows.length}</span></p></div>
            <div><p className="text-sm text-slate-600">Miembros de la Junta</p><p className="text-2xl font-bold tabular-nums">{data?.voters ?? "—"}</p></div>
          </div>
        )}
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input aria-label="Buscar candidato" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar candidato" className={`${inputCls} pl-9`} />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} className="h-4 w-4 accent-asigbo-blue" /> Solo los que aún no voto</label>
          <Link href={`/admin/ranking?e=${examId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-asigbo-blue hover:underline"><Trophy className="h-4 w-4" aria-hidden="true" /> Ranking y preselección en bloque</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Candidato</th>
                <th className="px-4 py-3 font-semibold">Puntaje</th>
                <th className="px-4 py-3 font-semibold">La Junta</th>
                <th className="px-4 py-3 font-semibold">Tu voto</th>
                <th className="px-4 py-3 font-semibold">Decisión final</th>
                <th className="px-4 py-3"><span className="sr-only">Abrir</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonRows cols={7} />}
              {!isLoading && shown.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">{onlyPending ? "Ya votaste a todos. ¡Buen trabajo!" : "No hay candidatos con estos filtros."}</td></tr>}
              {shown.map((r) => {
                const mine = chip(r.myVote);
                const fin = chip(r.decision);
                return (
                  <tr key={r.sessionId} className={`border-t border-slate-100 hover:bg-slate-50/70 ${r.status === "TERMINATED" ? "bg-red-50/40" : ""}`}>
                    <td className="px-4 py-3 tabular-nums text-slate-500">{r.position ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/evaluation/${r.sessionId}`} className="font-medium text-slate-900 hover:text-asigbo-blue hover:underline">{r.name}</Link>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span>{r.email}</span>
                        {r.status === "TERMINATED" && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-800"><AlertTriangle className="h-3 w-3" aria-hidden="true" /> Cerrado</span>}
                        {r.status === "SUBMITTED" && r.reviewReasons.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900"><Flag className="h-3 w-3" aria-hidden="true" /> Revisar</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{r.rawPct == null ? <span className="text-slate-400">—</span> : <><span className="font-semibold">{Math.round(r.rawPct)}%</span>{r.flagCount > 0 && <span className="ml-1.5 text-xs text-red-700">{r.flagCount} infr.</span>}</>}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                        {VOTES.map((v) => r.tally[v.key] > 0 && <span key={v.key} className={`rounded-full px-2 py-0.5 ${v.chip}`} title={v.label}>{SHORT[v.key]} {r.tally[v.key]}</span>)}
                        {r.tally.total === 0 && <span className="font-normal text-slate-400">Sin votos</span>}
                        {r.comments > 0 && <span className="inline-flex items-center gap-1 font-normal text-slate-500" title="Comentarios"><MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />{r.comments}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">{mine ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${mine.chip}`}>{mine.label}</span> : <span className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-500">Pendiente</span>}</td>
                    <td className="px-4 py-3">{fin ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${fin.chip}`}>{fin.label}</span> : <span className="text-xs text-slate-400">{canDecide ? "Por decidir" : "—"}</span>}</td>
                    <td className="px-4 py-3 text-right"><Link href={`/admin/evaluation/${r.sessionId}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">{r.myVote ? "Revisar" : "Evaluar"} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
