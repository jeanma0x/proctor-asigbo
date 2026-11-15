"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { EVENT_LABEL } from "@/lib/labels";
import { card, inputCls } from "@/components/admin/ui";
import type { getDashboard } from "@/actions/dashboard";

type Data = NonNullable<Awaited<ReturnType<typeof getDashboard>>>;

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n)}%`);

function Bars({ items, label }: { items: { key: string; label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul aria-label={label} className="space-y-2.5">
      {items.map((i) => (
        <li key={i.key} className="grid grid-cols-[12rem_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="leading-tight text-slate-700">{i.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-asigbo-blue" style={{ width: `${(i.value / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums">{i.value}</span>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardView({ data }: { data: Data }) {
  const router = useRouter();
  const s = data.selected;

  if (!s) {
    return (
      <div className={`${card} p-8 text-center`}>
        <p className="font-semibold">Aún no hay convocatorias</p>
        <p className="mt-1 text-sm text-slate-600">Crea la primera para empezar a registrar exámenes y resultados.</p>
        <Link href="/admin/convocatorias" className="mt-4 inline-block text-sm font-semibold text-asigbo-blue underline">Ir a Convocatorias</Link>
      </div>
    );
  }

  const kpis = [
    ["Aspirantes habilitados", String(s.enabled)],
    ["Han iniciado", String(s.started)],
    ["Entregaron", String(s.submitted)],
    ["Promedio de aciertos", pct(s.avgPct)],
    ["Cerrados por fraude", `${s.terminated}`, s.started ? `${Math.round(s.fraud)}% de quienes iniciaron` : undefined],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="conv" className="text-sm font-medium text-slate-700">Convocatoria</label>
        <select id="conv" value={s.id} onChange={(e) => router.push(`/admin/dashboard?c=${e.target.value}`)} className={`${inputCls} !w-auto`}>
          {data.convocatorias.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.year})</option>)}
        </select>
        {data.inProgress > 0 && (
          <Link href="/admin/live" className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-200">
            {data.inProgress} en examen ahora →
          </Link>
        )}
      </div>

      <section className={`${card} grid grid-cols-2 divide-slate-100 lg:grid-cols-5 lg:divide-x`}>
        {kpis.map(([k, v, hint]) => (
          <div key={k} className="px-6 py-5">
            <p className="text-3xl font-bold tabular-nums tracking-tight">{v}</p>
            <p className="mt-1 text-sm text-slate-600">{k}</p>
            {hint && <p className="text-xs text-slate-500">{hint}</p>}
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${card} p-6`}>
          <h2 className="font-semibold">Distribución de puntajes</h2>
          <p className="mb-4 text-sm text-slate-600">Entregas por rango de porcentaje de aciertos</p>
          {s.submitted === 0 ? <p className="py-6 text-sm text-slate-500">Aún no hay entregas en esta convocatoria.</p> : (
            <Bars label="Distribución de puntajes" items={data.distribution.map((d) => ({ key: d.label, label: d.label, value: d.count }))} />
          )}
        </section>
        <section className={`${card} p-6`}>
          <h2 className="font-semibold">Incidencias de seguridad</h2>
          <p className="mb-4 text-sm text-slate-600">Eventos registrados durante los exámenes</p>
          {data.incidents.length === 0 ? <p className="py-6 text-sm text-slate-500">Sin incidencias registradas.</p> : (
            <Bars label="Incidencias por tipo" items={data.incidents.map((i) => ({ key: i.type, label: EVENT_LABEL[i.type] ?? i.type, value: i.count }))} />
          )}
        </section>
      </div>

      {data.daily.length > 0 && (
        <section className={`${card} p-6`}>
          <h2 className="font-semibold">Entregas por día</h2>
          <p className="mb-4 text-sm text-slate-600">Últimos días con actividad</p>
          <Bars label="Entregas por día" items={data.daily.map((d) => ({ key: d.day, label: d.day, value: d.count }))} />
        </section>
      )}

      <section className={`${card} overflow-hidden`}>
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold">Histórico por convocatoria</h2>
          <p className="text-sm text-slate-600">Comparativo año con año; los datos de convocatorias anteriores se conservan siempre.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Convocatoria</th>
                <th className="px-4 py-3 text-right font-semibold">Aspirantes</th>
                <th className="px-4 py-3 text-right font-semibold">Entregaron</th>
                <th className="px-4 py-3 text-right font-semibold">Finalización</th>
                <th className="px-4 py-3 text-right font-semibold">Promedio</th>
                <th className="px-4 py-3 text-right font-semibold">Fraude</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((h) => (
                <tr key={h.id} className={`border-t border-slate-100 ${h.id === s.id ? "bg-asigbo-blue/5" : ""}`}>
                  <td className="px-6 py-3">
                    <Link href={`/admin/dashboard?c=${h.id}`} className="font-medium hover:text-asigbo-blue hover:underline">{h.name}</Link>
                    <span className="ml-2 text-xs text-slate-500">{h.year}{h.status === "ARCHIVED" ? " · archivada" : ""}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.enabled}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.submitted}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.enabled ? pct(h.completion) : "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{pct(h.avgPct)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.started ? pct(h.fraud) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
