"use client";

import { useState, useTransition } from "react";
import useSWR from "swr";
import { Loader2, Search } from "lucide-react";
import { listAuditLog, type AuditFilters, type AuditRow } from "@/actions/audit";
import { card, inputCls, btnGhost } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/format";

const CATEGORIES: Record<string, string> = {
  decision: "Decisiones", grade: "Calificaciones", exam: "Exámenes", session: "Accesos y sesiones", convocatoria: "Convocatorias",
  candidate: "Candidatos", user: "Usuarios y roles", account: "Cuenta", export: "Exportaciones", auth: "Inicios de sesión",
};
const TONE: Record<string, string> = {
  decision: "bg-blue-100 text-blue-900", grade: "bg-blue-100 text-blue-900", exam: "bg-slate-200 text-slate-800", session: "bg-slate-200 text-slate-800",
  convocatoria: "bg-slate-200 text-slate-800", candidate: "bg-slate-200 text-slate-800", user: "bg-amber-100 text-amber-900", account: "bg-slate-100 text-slate-700",
  export: "bg-emerald-100 text-emerald-800", auth: "bg-slate-100 text-slate-700",
};

export default function AuditExplorer() {
  const [actor, setActor] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [extra, setExtra] = useState<AuditRow[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const [loadingMore, startMore] = useTransition();

  const filters: AuditFilters = { actor: actor || undefined, category: category || undefined, q: q.trim() || undefined, from: from || undefined, to: to || undefined };
  const { data, isLoading } = useSWR(["audit", filters], async () => { setExtra([]); setNext(undefined); return listAuditLog(filters); }, { keepPreviousData: true, refreshInterval: 15000 });

  const rows = [...(data?.rows ?? []), ...extra];
  const cursor = next === undefined ? data?.next ?? null : next;

  const more = () => startMore(async () => {
    if (!cursor) return;
    const res = await listAuditLog({ ...filters, cursor });
    if (res) { setExtra((e) => [...e, ...res.rows]); setNext(res.next); }
  });

  return (
    <div className="space-y-6">
      <section className={`${card} p-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input aria-label="Buscar en la bitácora" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar (nombre de candidato, examen…)" className={`${inputCls} pl-9`} />
          </div>
          <select aria-label="Persona" value={actor} onChange={(e) => setActor(e.target.value)} className={`${inputCls} !w-auto`}>
            <option value="">Todas las personas</option>
            {(data?.actors ?? []).map((a) => <option key={a.email} value={a.email}>{a.name || a.email}</option>)}
          </select>
          <select aria-label="Tipo de acción" value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} !w-auto`}>
            <option value="">Todas las acciones</option>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div><label htmlFor="au-from" className="block text-xs text-slate-600">Desde</label><input id="au-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} !w-auto`} /></div>
          <div><label htmlFor="au-to" className="block text-xs text-slate-600">Hasta</label><input id="au-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} !w-auto`} /></div>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-6 py-3 font-semibold">Fecha</th><th className="px-4 py-3 font-semibold">Persona</th><th className="px-4 py-3 font-semibold">Tipo</th><th className="px-4 py-3 font-semibold">Detalle</th></tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden="true" /></td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500">No hay registros con estos filtros.</td></tr>}
              {rows.map((r) => {
                const cat = r.action.split(".")[0];
                return (
                  <tr key={r.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">{fmtDateTime(r.createdAt)}</td>
                    <td className="px-4 py-3"><p className="font-medium">{r.actorName || r.actorEmail.split("@")[0]}</p><p className="text-xs text-slate-500">{r.actorEmail}</p></td>
                    <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[cat] ?? "bg-slate-100 text-slate-700"}`}>{CATEGORIES[cat] ?? cat}</span></td>
                    <td className="px-4 py-3 text-slate-800">{r.summary}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {cursor && <div className="border-t border-slate-100 p-4 text-center"><button type="button" onClick={more} disabled={loadingMore} className={btnGhost}>{loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Cargar más</button></div>}
      </section>
      <p className="text-xs text-slate-500">La bitácora es de solo lectura: no se puede editar ni borrar. Las horas se muestran en horario de Guatemala.</p>
    </div>
  );
}
