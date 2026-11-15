"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Download, FileText, Loader2, Trophy } from "lucide-react";
import { listResults } from "@/actions/results";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/admin/ui";
import { METHOD_INFO, type RankMethod } from "@/lib/ranking";
import { STATUS_LABEL } from "@/lib/labels";

export default function ReportsCenter() {
  const [convocatoriaId, setConvocatoriaId] = useState("");
  const [examId, setExamId] = useState("");
  const [method, setMethod] = useState<RankMethod>("integrity");

  const { data, isLoading } = useSWR(["reports", convocatoriaId, examId], () => listResults({ convocatoriaId: convocatoriaId || undefined, examId: examId || undefined }), { keepPreviousData: true });
  const exams = (data?.exams ?? []).filter((e) => !convocatoriaId || e.convocatoriaId === convocatoriaId);
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <section className={`${card} p-5`}>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="rp-conv" className="text-sm font-medium text-slate-700">Convocatoria</label>
            <select id="rp-conv" value={convocatoriaId} onChange={(e) => { setConvocatoriaId(e.target.value); setExamId(""); }} className={`${inputCls} mt-1`}>
              <option value="">Todas</option>
              {(data?.convocatorias ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.year})</option>)}
            </select>
          </div>
          <div className="min-w-64 flex-1">
            <label htmlFor="rp-exam" className="text-sm font-medium text-slate-700">Examen</label>
            <select id="rp-exam" value={examId} onChange={(e) => setExamId(e.target.value)} className={`${inputCls} mt-1`}>
              <option value="">Selecciona un examen…</option>
              {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${card} p-6`}>
          <h2 className="flex items-center gap-2 font-semibold"><FileText className="h-5 w-5 text-asigbo-blue" aria-hidden="true" /> Informe grupal del examen</h2>
          <p className="mt-1 text-sm text-slate-600">PDF con membrete: resumen, distribución de puntajes, clasificación completa, dificultad por pregunta, metodología y firmas.</p>
          <label htmlFor="rp-method" className="mt-4 block text-sm font-medium text-slate-700">Método de ranking</label>
          <select id="rp-method" value={method} onChange={(e) => setMethod(e.target.value as RankMethod)} className={`${inputCls} mt-1`}>
            {(Object.keys(METHOD_INFO) as RankMethod[]).map((m) => <option key={m} value={m}>{METHOD_INFO[m].label}</option>)}
          </select>
          <div className="mt-4 flex flex-wrap gap-2">
            <a aria-disabled={!examId} href={examId ? `/admin/reports/exam/${examId}/pdf?method=${method}` : undefined} className={`${btnPrimary} ${examId ? "" : "pointer-events-none opacity-50"}`}><FileText className="h-4 w-4" aria-hidden="true" /> Descargar PDF</a>
            <a aria-disabled={!examId} href={examId ? `/admin/reports/exam/${examId}/csv?method=${method}` : undefined} className={`${btnGhost} ${examId ? "" : "pointer-events-none opacity-50"}`}><Download className="h-4 w-4" aria-hidden="true" /> Ranking en CSV</a>
            {examId && <Link href={`/admin/ranking?e=${examId}`} className={btnGhost}><Trophy className="h-4 w-4" aria-hidden="true" /> Ver ranking</Link>}
          </div>
          {!examId && <p className="mt-3 text-xs text-slate-500">Elige un examen para habilitar la descarga.</p>}
        </section>

        <section className={`${card} p-6`}>
          <h2 className="flex items-center gap-2 font-semibold"><Download className="h-5 w-5 text-asigbo-blue" aria-hidden="true" /> Resultados en CSV</h2>
          <p className="mt-1 text-sm text-slate-600">Todos los resultados (de la convocatoria o examen elegidos) para análisis en Excel.</p>
          <p className="mt-4 text-sm text-slate-700">Para filtrar por estado o buscar candidatos, usa el módulo <Link href="/admin/results" className="font-semibold text-asigbo-blue underline">Resultados</Link> y su botón «Exportar CSV».</p>
        </section>
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold">Informes individuales</h2>
          <p className="text-sm text-slate-600">PDF por candidato: puntaje, respuestas pregunta por pregunta, posición en el ranking y bitácora de seguridad.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-6 py-3 font-semibold">Candidato</th><th className="px-4 py-3 font-semibold">Examen</th><th className="px-4 py-3 font-semibold">Estado</th><th className="px-4 py-3 font-semibold">Puntaje</th><th className="px-6 py-3"><span className="sr-only">Descargar</span></th></tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden="true" /></td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">No hay resultados con este filtro.</td></tr>}
              {rows.slice(0, 200).map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-6 py-3"><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.email}</p></td>
                  <td className="px-4 py-3 text-slate-700">{r.examTitle}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_LABEL[r.status].cls}`}>{STATUS_LABEL[r.status].label}</span></td>
                  <td className="px-4 py-3 tabular-nums">{r.score == null ? "—" : `${r.score} / ${r.maxScore}`}</td>
                  <td className="px-6 py-3 text-right"><a href={`/admin/reports/candidate/${r.id}/pdf`} className={`${btnGhost} !px-3 !py-1.5 text-xs`}><FileText className="h-3.5 w-3.5" aria-hidden="true" /> Informe PDF</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 200 && <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">Mostrando 200 de {rows.length}. Filtra por examen para ver el resto.</p>}
      </section>
    </div>
  );
}
