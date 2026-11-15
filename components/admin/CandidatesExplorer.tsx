"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronRight, Loader2, MessageSquare, Search } from "lucide-react";
import { listCandidates, type CandidateFilters } from "@/actions/candidates";
import { card, inputCls } from "@/components/admin/ui";
import { initials } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/labels";

export const DECISION: Record<"SELECTED" | "WAITLIST" | "NOT_SELECTED", { label: string; cls: string }> = {
  SELECTED: { label: "Seleccionado", cls: "bg-emerald-100 text-emerald-800" },
  WAITLIST: { label: "Lista de espera", cls: "bg-amber-100 text-amber-900" },
  NOT_SELECTED: { label: "No seleccionado", cls: "bg-slate-200 text-slate-700" },
};

export default function CandidatesExplorer() {
  const [q, setQ] = useState("");
  const [convocatoriaId, setConvocatoriaId] = useState("");
  const [decision, setDecision] = useState<NonNullable<CandidateFilters["decision"]> | "">("");
  const [pendingOnly, setPendingOnly] = useState(false);

  const filters: CandidateFilters = { q: q.trim() || undefined, convocatoriaId: convocatoriaId || undefined, decision: decision || undefined, pendingOnly };
  const { data, isLoading } = useSWR(["candidates", filters], () => listCandidates(filters), { keepPreviousData: true });
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <section className={`${card} p-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input aria-label="Buscar candidato" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o correo" className={`${inputCls} pl-9`} />
          </div>
          <select aria-label="Convocatoria" value={convocatoriaId} onChange={(e) => setConvocatoriaId(e.target.value)} className={`${inputCls} !w-auto`}>
            <option value="">Todas las convocatorias</option>
            {(data?.convocatorias ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.year})</option>)}
          </select>
          <select aria-label="Decisión" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)} className={`${inputCls} !w-auto`}>
            <option value="">Cualquier decisión</option>
            <option value="SELECTED">Seleccionados</option>
            <option value="WAITLIST">Lista de espera</option>
            <option value="NOT_SELECTED">No seleccionados</option>
            <option value="UNDECIDED">Sin decidir</option>
          </select>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} className="h-4 w-4 accent-asigbo-blue" /> Por calificar
          </label>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Candidato</th>
                <th className="px-4 py-3 font-semibold">Última participación</th>
                <th className="px-4 py-3 font-semibold">Resultado</th>
                <th className="px-4 py-3 font-semibold">Decisión</th>
                <th className="px-4 py-3 font-semibold">Avisos</th>
                <th className="px-4 py-3"><span className="sr-only">Abrir</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden="true" /></td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">No hay candidatos con estos filtros.</td></tr>}
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-asigbo-blue/10 text-xs font-bold text-asigbo-blue">{initials(c.name, c.email)}</span>
                      <div className="min-w-0">
                        <Link href={`/admin/candidates/${c.id}`} className="block truncate font-medium hover:text-asigbo-blue hover:underline">{c.name}</Link>
                        <p className="truncate text-xs text-slate-500">{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {c.lastExam ? <><p>{c.lastExam}</p><p className="text-xs text-slate-500">{c.lastConvocatoria ?? "—"} · {c.participations} participación(es)</p></> : <span className="text-slate-400">Sin participaciones</span>}
                  </td>
                  <td className="min-w-36 px-4 py-3">
                    {c.lastStatus && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_LABEL[c.lastStatus].cls}`}>{STATUS_LABEL[c.lastStatus].label}</span>}
                    {c.lastPct != null && <p className="mt-1 text-sm font-semibold tabular-nums">{Math.round(c.lastPct)}%</p>}
                  </td>
                  <td className="px-4 py-3">{c.decision ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DECISION[c.decision].cls}`}>{DECISION[c.decision].label}</span> : <span className="text-xs text-slate-400">—</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {c.pendingGrade > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">{c.pendingGrade} por calificar</span>}
                      {c.flags > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-800">{c.flags} infr.</span>}
                      {c.notes > 0 && <span className="inline-flex items-center gap-1 text-slate-600"><MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> {c.notes}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right"><Link href={`/admin/candidates/${c.id}`} aria-label={`Abrir perfil de ${c.name}`} className="inline-flex rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.truncated && <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">Mostrando los 500 más recientes. Usa la búsqueda para encontrar al resto.</p>}
      </section>
    </div>
  );
}
