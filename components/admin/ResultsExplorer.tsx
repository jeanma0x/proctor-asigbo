"use client";

import { SkeletonRows } from "@/components/admin/skeletons";
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronRight, Download, FileText, Search, Trophy } from "lucide-react";
import { exportResultsCsv, listResults, type ResultFilters } from "@/actions/results";
import PdfPreview from "@/components/admin/PdfPreview";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { btnGhost, card, inputCls } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/labels";

export default function ResultsExplorer({ canExport }: { canExport: boolean }) {
  const params = useSearchParams();
  const [convocatoriaId, setConvocatoriaId] = useState(params.get("c") ?? "");
  const [examId, setExamId] = useState("");
  const [status, setStatus] = useState<NonNullable<ResultFilters["status"]> | "">("");
  const [q, setQ] = useState("");
  const [askCsv, setAskCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const filters: ResultFilters = {
    convocatoriaId: convocatoriaId || undefined,
    examId: examId || undefined,
    status: status || undefined,
    q: q.trim() || undefined,
  };
  const { data, isLoading } = useSWR(["results", filters], () => listResults(filters), { keepPreviousData: true });

  type SortKey = "name" | "score" | "flags" | "date";
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const toggleSort = (key: SortKey) => setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: key === "name" ? 1 : -1 }));
  const rows = useMemo(() => {
    const base = data?.rows ?? [];
    if (!sort) return base;
    const val = (r: (typeof base)[number]) =>
      sort.key === "name" ? r.name.toLowerCase() : sort.key === "score" ? (r.score != null && r.maxScore ? r.score / r.maxScore : -1) : sort.key === "flags" ? r.flagCount : r.submittedAt ? new Date(r.submittedAt).getTime() : 0;
    return [...base].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  }, [data, sort]);
  const sortTh = (k: SortKey, cls: string, children: React.ReactNode) => (
    <th key={k} className={cls} aria-sort={sort?.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex cursor-pointer items-center gap-1 font-semibold uppercase tracking-wide hover:text-slate-900">
        {children}{sort?.key === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
      </button>
    </th>
  );
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
            <button type="button" onClick={() => setAskCsv(true)} disabled={rows.length === 0} className={btnGhost}>
              <Download className="h-4 w-4" aria-hidden="true" /> Exportar CSV
            </button>
          )}
        </div>
        {examId && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs font-medium text-slate-500">Este examen:</span>
            <Link href={`/admin/ranking?e=${examId}`} className={`${btnGhost} !px-3 !py-1.5 text-xs`}><Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Ranking y decisiones</Link>
            {canExport && <PdfPreview href={`/admin/reports/exam/${examId}/pdf`} title="Informe grupal del examen" className={`${btnGhost} !px-3 !py-1.5 text-xs`}><FileText className="h-3.5 w-3.5" aria-hidden="true" /> Informe grupal PDF</PdfPreview>}
          </div>
        )}
        {exportError && <p role="alert" className="mt-2 text-sm text-red-700">{exportError}</p>}
      </section>

      <ConfirmDialog open={askCsv} title={`¿Exportar ${rows.length} registro(s) a CSV?`} description="Contiene datos personales de los aspirantes (en su mayoría menores de edad). La exportación queda registrada en la bitácora con tu nombre." confirmLabel="Sí, exportar" onCancel={() => setAskCsv(false)} onConfirm={() => { setAskCsv(false); void download(); }} />
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
                {sortTh("name", "px-6 py-3 font-semibold", "Candidato")}
                <th className="px-4 py-3 font-semibold">Examen</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                {sortTh("score", "px-4 py-3 font-semibold", "Puntaje")}
                {sortTh("flags", "px-4 py-3 font-semibold", "Infracciones")}
                {sortTh("date", "px-4 py-3 font-semibold", "Entrega")}
                <th className="px-4 py-3"><span className="sr-only">Ver detalle</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonRows cols={7} />}
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
                        <PdfPreview href={`/admin/reports/candidate/${r.id}/pdf`} title={`Informe de ${r.name}`} label={`Vista previa del informe de ${r.name}`} className="inline-flex cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                          <FileText className="h-4 w-4" aria-hidden="true" />
                        </PdfPreview>
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
