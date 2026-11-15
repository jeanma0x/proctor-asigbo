"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Download, FileText, Loader2, Search, Trophy } from "lucide-react";
import { exportResultsCsv, listResults, type ResultFilters } from "@/actions/results";
import { btnGhost, card, inputCls } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/labels";

export default function ResultsExplorer({ canExport }: { canExport: boolean }) {
  const params = useSearchParams();
  const [convocatoriaId, setConvocatoriaId] = useState(params.get("c") ?? "");
  const [examId, setExamId] = useState("");
  const [status, setStatus] = useState<NonNullable<ResultFilters["status"]> | "">("");
  const [q, setQ] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);

  const filters: ResultFilters = {
    convocatoriaId: convocatoriaId || undefined,
    examId: examId || undefined,
    status: status || undefined,
    q: q.trim() || undefined,
  };
  const { data, isLoading } = useSWR(["results", filters], () => listResults(filters), { keepPreviousData: true });

  const rows = data?.rows ?? [];
  const exams = (data?.exams ?? []).filter((e) => !convocatoriaId || e.convocatoriaId === convocatoriaId);
  const graded = rows.filter((r) => r.status === "SUBMITTED" && r.score != null && r.maxScore > 0);
  const avgPct = graded.length ? Math.round(graded.reduce((n, r) => n + (r.score! / r.maxScore) * 100, 0) / graded.length) : null;

  const download = async () => {
    setExportError(null);
    const res = await exportResultsCsv(filters);
    if (!res.ok) return setExportError(res.error);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([res.csv], { type: "text/csv;charset=utf-8" }));
    a.download = res.filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      <section className={`${card} p-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="Convocatoria" value={convocatoriaId} onChange={(e) => { setConvocatoriaId(e.target.value); setExamId(""); }} className={`${inputCls} !w-auto`}>
            <option value="">Todas las convocatorias</option>
            {(data?.convocatorias ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.year})</option>)}
          </select>
          <select aria-label="Examen" value={examId} onChange={(e) => setExamId(e.target.value)} className={`${inputCls} !w-auto`}>
            <option value="">Todos los exámenes</option>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={`${inputCls} !w-auto`}>
            <option value="">Con resultado</option>
            <option value="SUBMITTED">Entregados</option>
            <option value="TERMINATED">Cerrados</option>
            <option value="IN_PROGRESS">En examen</option>
            <option value="NOT_STARTED">Sin iniciar</option>
          </select>
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input aria-label="Buscar candidato" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o correo" className={`${inputCls} pl-9`} />
          </div>
          {canExport && (
            <button type="button" onClick={download} disabled={rows.length === 0} className={btnGhost}>
              <Download className="h-4 w-4" aria-hidden="true" /> Exportar CSV
            </button>
          )}
        </div>
        {examId && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs font-medium text-slate-500">Este examen:</span>
            <Link href={`/admin/ranking?e=${examId}`} className={`${btnGhost} !px-3 !py-1.5 text-xs`}><Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Ranking y decisiones</Link>
            {canExport && <a href={`/admin/reports/exam/${examId}/pdf`} className={`${btnGhost} !px-3 !py-1.5 text-xs`}><FileText className="h-3.5 w-3.5" aria-hidden="true" /> Informe grupal PDF</a>}
          </div>
        )}
        {exportError && <p role="alert" className="mt-2 text-sm text-red-700">{exportError}</p>}
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Registros", rows.length],
          ["Entregados", rows.filter((r) => r.status === "SUBMITTED").length],
          ["Promedio de aciertos", avgPct == null ? "—" : `${avgPct}%`],
        ].map(([k, v]) => (
          <div key={k} className={`${card} px-5 py-4`}>
            <p className="text-2xl font-bold tabular-nums">{v}</p>
            <p className="text-sm text-slate-600">{k}</p>
          </div>
        ))}
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Candidato</th>
                <th className="px-4 py-3 font-semibold">Examen</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Puntaje</th>
                <th className="px-4 py-3 font-semibold">Infracciones</th>
                <th className="px-4 py-3 font-semibold">Entrega</th>
                <th className="px-4 py-3"><span className="sr-only">Ver detalle</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden="true" /></td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">No hay resultados con estos filtros.</td></tr>}
              {rows.map((r) => {
                const pct = r.score != null && r.maxScore ? Math.round((r.score / r.maxScore) * 100) : null;
                return (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-6 py-3">
                      <Link href={`/admin/results/${r.id}`} className="font-medium text-slate-900 hover:text-asigbo-blue hover:underline">{r.name}</Link>
                      <p className="text-xs text-slate-500">{r.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{r.examTitle}</p>
                      {r.convocatoria && <p className="text-xs text-slate-500">{r.convocatoria}</p>}
                    </td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_LABEL[r.status].cls}`}>{STATUS_LABEL[r.status].label}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {r.score == null ? "—" : <><span className="font-semibold">{r.score}</span> / {r.maxScore}{pct != null && <span className="ml-1.5 text-xs text-slate-500">({pct}%)</span>}</>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{r.flagCount > 0 ? <span className="font-semibold text-red-700">{r.flagCount}</span> : <span className="text-slate-400">0</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDateTime(r.submittedAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {canExport && r.status !== "NOT_STARTED" && (
                        <a href={`/admin/reports/candidate/${r.id}/pdf`} aria-label={`Informe PDF de ${r.name}`} title="Informe PDF" className="inline-flex rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                          <FileText className="h-4 w-4" aria-hidden="true" />
                        </a>
                      )}
                      <Link href={`/admin/results/${r.id}`} aria-label={`Ver detalle de ${r.name}`} className="inline-flex rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data?.truncated && <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">Mostrando los 1000 más recientes. Afina los filtros para ver el resto.</p>}
      </section>
    </div>
  );
}
