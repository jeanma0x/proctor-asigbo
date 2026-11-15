"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Archive, ArchiveRestore, CalendarPlus, ClipboardList, Loader2, Users } from "lucide-react";
import { createConvocatoria, setConvocatoriaStatus, type ConvocatoriaRow } from "@/actions/convocatorias";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/admin/ui";

export default function ConvocatoriasManager({ rows, canManage }: { rows: ConvocatoriaRow[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [year, setYear] = useState(2027);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "No se pudo completar la acción.");
      after?.();
      router.refresh();
    });
  };

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    run(() => createConvocatoria({ name, year, description }), () => { setName(""); setDescription(""); });
  };

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </div>
      )}

      {canManage && (
        <section className={`${card} p-6`}>
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <CalendarPlus className="h-5 w-5 text-asigbo-blue" aria-hidden="true" /> Nueva convocatoria
          </h2>
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div>
              <label htmlFor="c-name" className="text-sm font-medium text-slate-700">Nombre</label>
              <input id="c-name" required value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mt-1`} placeholder="Convocatoria de Becas 2028" maxLength={120} />
            </div>
            <div>
              <label htmlFor="c-year" className="text-sm font-medium text-slate-700">Año</label>
              <input id="c-year" type="number" required min={2000} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${inputCls} mt-1`} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="c-desc" className="text-sm font-medium text-slate-700">Notas (opcional)</label>
              <input id="c-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputCls} mt-1`} maxLength={500} />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={pending} className={btnPrimary}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Crear convocatoria
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {rows.length === 0 && <p className={`${card} p-6 text-sm text-slate-600 md:col-span-2`}>Aún no hay convocatorias.</p>}
        {rows.map((c) => {
          const rate = c.enabled ? Math.round(((c.submitted + c.terminated) / c.enabled) * 100) : 0;
          return (
            <article key={c.id} className={`${card} p-6 ${c.status === "ARCHIVED" ? "opacity-80" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-4xl font-bold tracking-tight text-asigbo-blue">{c.year}</p>
                  <h2 className="mt-1 font-semibold">{c.name}</h2>
                  {c.description && <p className="mt-0.5 text-sm text-slate-600">{c.description}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${c.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                  {c.status === "ACTIVE" ? "Activa" : "Archivada"}
                </span>
              </div>
              <dl className="mt-5 grid grid-cols-4 gap-2 text-center">
                {[
                  ["Exámenes", c.exams],
                  ["Aspirantes", c.enabled],
                  ["Entregaron", c.submitted],
                  ["Prom.", c.avgScore == null ? "—" : c.avgScore.toFixed(1)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-slate-50 py-2.5">
                    <dd className="text-lg font-bold tabular-nums">{v}</dd>
                    <dt className="text-xs text-slate-500">{k}</dt>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-slate-500">Finalización: <strong className="text-slate-800">{rate}%</strong> · Cerrados por fraude: <strong className="text-slate-800">{c.terminated}</strong></p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/admin/results?c=${c.id}`} className={btnGhost}><ClipboardList className="h-4 w-4" aria-hidden="true" /> Ver resultados</Link>
                <Link href={`/admin/dashboard?c=${c.id}`} className={btnGhost}><Users className="h-4 w-4" aria-hidden="true" /> Dashboard</Link>
                {canManage && (
                  <button type="button" disabled={pending} onClick={() => run(() => setConvocatoriaStatus(c.id, c.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"))} className={btnGhost}>
                    {c.status === "ACTIVE" ? <Archive className="h-4 w-4" aria-hidden="true" /> : <ArchiveRestore className="h-4 w-4" aria-hidden="true" />}
                    {c.status === "ACTIVE" ? "Archivar" : "Reactivar"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
