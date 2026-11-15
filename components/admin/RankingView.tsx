"use client";

import { useState, useTransition } from "react";
import useSWR from "swr";
import Link from "next/link";
import { AlertCircle, Download, FileText, Flag, Info, Loader2 } from "lucide-react";
import { applyShortlist, getRanking, setDecision, type RankingExam } from "@/actions/ranking";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/admin/ui";
import { METHOD_INFO, STRIKE_PENALTY, type RankMethod } from "@/lib/ranking";

type Decision = "SELECTED" | "WAITLIST" | "NOT_SELECTED" | null;
const DECISION: Record<NonNullable<Decision>, { label: string; cls: string }> = {
  SELECTED: { label: "Seleccionado", cls: "bg-emerald-100 text-emerald-800" },
  WAITLIST: { label: "Lista de espera", cls: "bg-amber-100 text-amber-900" },
  NOT_SELECTED: { label: "No seleccionado", cls: "bg-slate-200 text-slate-700" },
};
const METHODS: RankMethod[] = ["integrity", "difficulty", "raw"];

export default function RankingView({ exams, canDecide, canExport, initialExamId }: { exams: RankingExam[]; canDecide: boolean; canExport: boolean; initialExamId?: string }) {
  const [examId, setExamId] = useState(exams.find((e) => e.id === initialExamId)?.id ?? exams[0]?.id ?? "");
  const [method, setMethod] = useState<RankMethod>("integrity");
  const [top, setTop] = useState(10);
  const [wait, setWait] = useState(5);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { data, isLoading, mutate } = useSWR(examId ? ["ranking", examId, method] : null, () => getRanking(examId, method), { keepPreviousData: true });
  const r = data?.result;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "No se pudo completar la acción.");
      setConfirm(false);
      await mutate();
    });
  };

  if (exams.length === 0) {
    return <div className={`${card} p-8 text-center text-sm text-slate-600`}>Aún no hay exámenes con entregas para rankear.</div>;
  }

  const maxIdx = Math.max(100, ...(r?.rows.map((x) => x.index) ?? [100]));

  return (
    <div className="space-y-6">
      <section className={`${card} p-5`}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-64 flex-1">
            <label htmlFor="rk-exam" className="text-sm font-medium text-slate-700">Examen</label>
            <select id="rk-exam" value={examId} onChange={(e) => setExamId(e.target.value)} className={`${inputCls} mt-1`}>
              {exams.map((e) => <option key={e.id} value={e.id}>{e.convocatoria ? `${e.convocatoria} · ` : ""}{e.title} ({e.entregados} entregas)</option>)}
            </select>
          </div>
          {canExport && examId && (
            <div className="flex gap-2">
              <a href={`/admin/reports/exam/${examId}/pdf?method=${method}`} className={btnPrimary}><FileText className="h-4 w-4" aria-hidden="true" /> Informe PDF</a>
              <a href={`/admin/reports/exam/${examId}/csv?method=${method}`} className={btnGhost}><Download className="h-4 w-4" aria-hidden="true" /> CSV</a>
            </div>
          )}
        </div>

        <div className="mt-5" role="radiogroup" aria-label="Método de ranking">
          <div className="grid gap-3 md:grid-cols-3">
            {METHODS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}
                className={`cursor-pointer rounded-xl border-2 p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue ${method === m ? "border-asigbo-blue bg-asigbo-blue/5" : "border-slate-200 hover:border-slate-300"}`}>
                <span className="block text-sm font-semibold">{METHOD_INFO[m].label}{m === "integrity" && <span className="ml-2 rounded-full bg-asigbo-green px-2 py-0.5 text-xs text-asigbo-blue-dark">Recomendado</span>}</span>
                <span className="mt-0.5 block text-xs text-slate-600">{METHOD_INFO[m].description}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {r && !r.difficultyReliable && method !== "raw" && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Hay menos de 5 entregas: la dificultad de cada pregunta aún no es confiable, así que todas pesan igual (equivale al puntaje bruto).</p>
      )}
      {r && r.pendingOpen > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {r.pendingOpen} pregunta(s) abierta(s) tienen respuestas sin calificar y todavía no entran al índice. Califícalas en el detalle de cada resultado y el ranking se actualizará solo.</p>
      )}
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}</div>}

      {r && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[["Clasificados", r.stats.n], ["Promedio", `${r.stats.mean}`], ["Mediana", `${r.stats.median}`], ["Desv. estándar", `${r.stats.stdev}`], ["Rango", `${Math.round(r.stats.min)}–${Math.round(r.stats.max)}`]].map(([k, v]) => (
            <div key={k} className={`${card} px-5 py-4`}><p className="text-2xl font-bold tabular-nums">{v}</p><p className="text-sm text-slate-600">{k}</p></div>
          ))}
        </div>
      )}

      {canDecide && r && r.rows.length > 0 && (
        <section className={`${card} p-5`}>
          <h2 className="font-semibold">Preselección</h2>
          <p className="text-sm text-slate-600">Marca de una vez a los primeros del ranking. Luego puedes ajustar cada caso en la tabla.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div><label htmlFor="rk-top" className="text-xs font-medium text-slate-700">Seleccionar a los primeros</label><input id="rk-top" type="number" min={1} max={r.rows.length} value={top} onChange={(e) => setTop(Number(e.target.value))} className={`${inputCls} mt-1 !w-28`} /></div>
            <div><label htmlFor="rk-wait" className="text-xs font-medium text-slate-700">Lista de espera</label><input id="rk-wait" type="number" min={0} value={wait} onChange={(e) => setWait(Number(e.target.value))} className={`${inputCls} mt-1 !w-28`} /></div>
            {!confirm ? (
              <button type="button" className={btnPrimary} onClick={() => setConfirm(true)} disabled={pending}>Aplicar preselección</button>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                <span>Se sobrescribirán las decisiones actuales de este examen.</span>
                <button type="button" className={btnGhost} onClick={() => setConfirm(false)}>Cancelar</button>
                <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => applyShortlist(examId, method, top, wait))}>{pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Confirmar</button>
              </div>
            )}
          </div>
        </section>
      )}

      <section className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Candidato</th>
                <th className="px-4 py-3 font-semibold">Índice</th>
                <th className="px-4 py-3 font-semibold">% bruto</th>
                <th className="px-4 py-3 font-semibold">% pond.</th>
                <th className="px-4 py-3 font-semibold">Infr.</th>
                <th className="px-4 py-3 font-semibold">Tiempo</th>
                <th className="px-4 py-3 font-semibold">Percentil</th>
                <th className="px-4 py-3 font-semibold">Decisión</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden="true" /></td></tr>}
              {r?.rows.map((x) => (
                <tr key={x.sessionId} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-bold tabular-nums">{x.position}{x.tied && <span title="Empate en el índice: se desempató por infracciones, tiempo y hora de entrega" className="ml-1 cursor-help text-xs font-normal text-slate-400">≈</span>}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/results/${x.sessionId}`} className="font-medium hover:text-asigbo-blue hover:underline">{x.name}</Link>
                    <p className="text-xs text-slate-500">{x.email}</p>
                    {x.reviewReasons.length > 0 && <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-800"><Flag className="h-3 w-3" aria-hidden="true" /> Revisar: {x.reviewReasons.join("; ")}</p>}
                  </td>
                  <td className="min-w-36 px-4 py-3">
                    <span className="font-bold tabular-nums">{x.index.toFixed(1)}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-asigbo-blue" style={{ width: `${(x.index / maxIdx) * 100}%` }} /></span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{x.rawPct.toFixed(0)}%</td>
                  <td className="px-4 py-3 tabular-nums">{x.weightedPct.toFixed(0)}%</td>
                  <td className="px-4 py-3 tabular-nums">{x.flagCount > 0 ? <span className="font-semibold text-red-700" title={method === "integrity" ? `−${STRIKE_PENALTY * x.flagCount} puntos` : undefined}>{x.flagCount}</span> : <span className="text-slate-400">0</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">{x.minutes ?? "—"} min</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{x.percentile}</td>
                  <td className="px-4 py-3">
                    {canDecide ? (
                      <select aria-label={`Decisión para ${x.name}`} value={x.decision ?? ""} disabled={pending} onChange={(e) => run(() => setDecision(x.sessionId, (e.target.value || null) as Decision))} className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium">
                        <option value="">Sin decidir</option>
                        <option value="SELECTED">Seleccionado</option>
                        <option value="WAITLIST">Lista de espera</option>
                        <option value="NOT_SELECTED">No seleccionado</option>
                      </select>
                    ) : x.decision ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DECISION[x.decision].cls}`}>{DECISION[x.decision].label}</span> : <span className="text-xs text-slate-400">Sin decidir</span>}
                    {x.decision && x.decidedBy && <p className="mt-1 text-xs text-slate-500" title={x.decidedBy}>por {x.decidedBy.split("@")[0]}</p>}
                  </td>
                </tr>
              ))}
              {r && r.rows.length === 0 && <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-500">No hay candidatos clasificados.</td></tr>}
            </tbody>
          </table>
        </div>
        {r && r.excluded.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-600">
            <strong>No clasifican (examen cerrado por infracciones):</strong> {r.excluded.map((e) => e.name).join(", ")}.
          </div>
        )}
      </section>

      {r && r.questions.length > 0 && (
        <section className={`${card} p-6`}>
          <h2 className="font-semibold">Dificultad por pregunta</h2>
          <p className="mb-4 text-sm text-slate-600">Porcentaje de candidatos que acertó cada pregunta y el peso que recibe en el índice.</p>
          <ul className="space-y-2.5">
            {r.questions.map((q, i) => (
              <li key={q.id} className="grid grid-cols-[1fr_8rem_6rem] items-center gap-3 text-sm">
                <span className="truncate" title={q.text}>{i + 1}. {q.text}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-asigbo-blue" style={{ width: `${q.pctCorrect}%` }} /></span>
                <span className="text-right tabular-nums text-slate-700">{q.pctCorrect}% · ×{q.weight}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
