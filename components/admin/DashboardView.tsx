"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Flag, Minus, Trophy } from "lucide-react";
import { ACCENT, BLUE, BLUE_MID, ColumnChart, HBars, LineChart, Meter, NEUTRAL, ScatterChart, SegmentedBar } from "@/components/admin/charts";
import { card, inputCls } from "@/components/admin/ui";
import { EVENT_LABEL } from "@/lib/labels";
import type { getDashboard } from "@/actions/dashboard";

type Data = NonNullable<Awaited<ReturnType<typeof getDashboard>>>;
const pct = (n: number | null | undefined, d = 0) => (n == null ? "—" : `${n.toFixed(d)}%`);

/** Variación con ícono y texto (nunca solo color). */
function Delta({ now, before, unit = " pts", invert = false, against: refLabel }: { now: number | null; before: number | null | undefined; unit?: string; invert?: boolean; against?: string }) {
  if (now == null || before == null) return <span className="text-xs text-slate-500">Sin convocatoria anterior para comparar</span>;
  const d = Math.round((now - before) * 10) / 10;
  const good = invert ? d < 0 : d > 0;
  const Icon = d === 0 ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${d === 0 ? "text-slate-600" : good ? "text-emerald-700" : "text-red-700"}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {d > 0 ? "+" : ""}{d}{unit} <span className="font-normal text-slate-500">vs {refLabel}</span>
    </span>
  );
}

function Panel({ title, hint, children, className = "" }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${card} p-6 ${className}`}>
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mb-4 mt-0.5 text-sm text-slate-600">{hint}</p>}
      {!hint && <div className="mb-4" />}
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="py-8 text-center text-sm text-slate-500">{text}</p>;

export default function DashboardView({ data }: { data: Data }) {
  const router = useRouter();
  const s = data.selected;
  const x = data.extra;

  if (!s || !x) {
    return (
      <div className={`${card} p-8 text-center`}>
        <p className="font-semibold">Aún no hay convocatorias</p>
        <p className="mt-1 text-sm text-slate-600">Crea la primera para empezar a registrar exámenes y resultados.</p>
        <Link href="/admin/convocatorias" className="mt-4 inline-block text-sm font-semibold text-asigbo-blue underline">Ir a Convocatorias</Link>
      </div>
    );
  }

  const prev = data.previous;
  const prevName = prev ? String(prev.year) : "";
  const o = x.outcome;
  const decided = x.decisions.selected + x.decisions.waitlist + x.decisions.notSelected;
  const years = [...data.history].filter((h) => h.avgPct != null).reverse();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="conv" className="text-sm font-medium text-slate-700">Convocatoria</label>
        <select id="conv" value={s.id} onChange={(e) => router.push(`/admin/dashboard?c=${e.target.value}`)} className={`${inputCls} !w-auto`}>
          {data.convocatorias.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.year})</option>)}
        </select>
        {x.inProgress > 0 && <Link href="/admin/live" className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-200">{x.inProgress} en examen ahora <ArrowRight className="ml-0.5 inline h-3 w-3" aria-hidden="true" /></Link>}
        {x.toReview > 0 && <Link href={`/admin/ranking${x.topExam ? `?e=${x.topExam.id}` : ""}`} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200"><Flag className="h-3 w-3" aria-hidden="true" /> {x.toReview} candidato(s) por revisar</Link>}
      </div>

      {/* Cifras principales */}
      <div className="grid gap-4 lg:grid-cols-4">
        <section className={`${card} p-6 lg:row-span-2 lg:flex lg:flex-col lg:justify-between`}>
          <div>
            <p className="text-sm font-medium text-slate-600">Promedio de aciertos</p>
            <p className="mt-2 text-6xl font-bold tracking-tight tabular-nums" style={{ color: BLUE }}>{s.avgPct == null ? "—" : Math.round(s.avgPct)}<span className="text-3xl">{s.avgPct == null ? "" : "%"}</span></p>
          </div>
          <div className="mt-4 space-y-1">
            <Delta now={s.avgPct} before={prev?.avgPct} against={prevName} />
            <p className="text-xs text-slate-500">Mediana {pct(x.medianPct)} · {s.submitted} entrega(s)</p>
          </div>
        </section>

        {[
          { k: "Aspirantes habilitados", v: String(s.enabled), sub: <Delta now={s.enabled} before={prev?.enabled} unit="" against={prevName} /> },
          { k: "Tasa de finalización", v: pct(s.enabled ? s.completion : null), meter: s.completion, sub: <span className="text-xs text-slate-500">{s.submitted + s.terminated} de {s.enabled} terminaron</span> },
          { k: "Tiempo promedio usado", v: pct(x.avgTimePct), meter: x.avgTimePct ?? 0, sub: <span className="text-xs text-slate-500">del tiempo asignado</span> },
          { k: "Cerrados por fraude", v: pct(s.started ? s.fraud : null), sub: <Delta now={s.started ? s.fraud : null} before={prev?.started ? prev.fraud : null} invert against={prevName} />, tone: s.terminated > 0 ? ACCENT : BLUE },
          { k: "Seleccionados", v: String(x.decisions.selected), sub: <span className="text-xs text-slate-500">{decided ? `${x.decisions.waitlist} en lista de espera` : "Aún sin decisiones"}</span> },
          { k: "Por revisar", v: String(x.toReview), sub: <span className="text-xs text-slate-500">infracciones o tiempos atípicos</span> },
        ].map((t) => (
          <div key={t.k} className={`${card} px-5 py-4`}>
            <p className="text-sm text-slate-600">{t.k}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight" style={{ color: t.tone ?? "#0f172a" }}>{t.v}</p>
            {t.meter != null && <div className="mt-2"><Meter value={t.meter} label={t.k} /></div>}
            <div className="mt-1.5">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Resultado de los aspirantes" hint="Cómo terminó cada persona habilitada">
          {s.enabled === 0 ? <Empty text="Aún no hay aspirantes habilitados." /> : (
            <SegmentedBar label="Reparto de resultados" parts={[
              { key: "s", label: "Entregaron", value: o.submitted, color: BLUE },
              { key: "i", label: "En examen", value: o.inProgress, color: BLUE_MID },
              { key: "n", label: "Sin iniciar", value: o.notStarted, color: NEUTRAL },
              { key: "t", label: "Cerrados por infracciones", value: o.terminated, color: ACCENT },
            ]} />
          )}
        </Panel>
        <Panel title="Embudo de participación" hint="Habilitados → iniciaron → entregaron">
          <HBars label="Embudo" max={Math.max(1, s.enabled)} items={[
            { key: "h", label: "Habilitados", value: s.enabled },
            { key: "i", label: "Iniciaron el examen", value: s.started, sub: s.enabled ? `${Math.round((s.started / s.enabled) * 100)}%` : "" },
            { key: "e", label: "Entregaron", value: s.submitted, sub: s.enabled ? `${Math.round((s.submitted / s.enabled) * 100)}%` : "" },
          ]} />
        </Panel>

        <Panel title="Distribución de puntajes" hint="Candidatos por rango de porcentaje de aciertos">
          {s.submitted === 0 ? <Empty text="Aún no hay entregas en esta convocatoria." /> : (
            <ColumnChart data={x.bins} label="Distribución de puntajes" markerAt={x.medianPct} markerLabel={x.medianPct != null ? `Mediana ${Math.round(x.medianPct)}%` : undefined} tableCols={["Rango de aciertos (%)", "Candidatos"]} />
          )}
        </Panel>
        <Panel title="Tiempo usado vs. aciertos" hint="Cada punto es un candidato; en naranja, quienes tuvieron infracciones">
          {x.scatter.length === 0 ? <Empty text="Aún no hay entregas para graficar." /> : <ScatterChart points={x.scatter} label="Dispersión de tiempo usado y aciertos" />}
        </Panel>

        <Panel title="Preguntas más difíciles" hint="Menor porcentaje de acierto (opción múltiple)">
          {x.hardest.length === 0 ? <Empty text="Sin datos de preguntas todavía." /> : <HBars label="Preguntas más difíciles" suffix="%" max={100} items={x.hardest.map((q) => ({ key: q.id, label: q.text, value: q.pct }))} />}
        </Panel>
        <Panel title="Preguntas más fáciles" hint="Mayor porcentaje de acierto">
          {x.easiest.length === 0 ? <Empty text="Sin datos de preguntas todavía." /> : <HBars label="Preguntas más fáciles" suffix="%" max={100} items={x.easiest.map((q) => ({ key: q.id, label: q.text, value: q.pct }))} />}
        </Panel>

        <Panel title="Entregas por día" hint="Evolución de las entregas durante la convocatoria">
          {x.daily.length === 0 ? <Empty text="Aún no hay entregas." /> : x.daily.length < 3 ? (
            <ColumnChart label="Entregas por día" tableCols={["Día", "Entregas"]} data={x.daily.map((d) => ({ label: d.label.slice(5), value: d.value }))} />
          ) : (
            <LineChart label="Entregas acumuladas por día" tableCols={["Día", "Entregas acumuladas"]} data={x.daily.reduce<{ label: string; value: number }[]>((acc, d) => [...acc, { label: d.label.slice(5), value: (acc.at(-1)?.value ?? 0) + d.value }], [])} />
          )}
        </Panel>
        <Panel title="Incidencias de seguridad" hint="Eventos registrados durante los exámenes">
          {x.incidents.length === 0 ? <Empty text="Sin incidencias registradas." /> : <HBars label="Incidencias por tipo" items={x.incidents.map((i) => ({ key: i.type, label: EVENT_LABEL[i.type] ?? i.type, value: i.count }))} />}
        </Panel>

        <Panel title="Mejores resultados" hint={x.topExam ? `Top 5 de «${x.topExam.title}» (índice ponderado + integridad)` : "Aún no hay entregas"} className="lg:col-span-2">
          {x.top.length === 0 ? <Empty text="Aún no hay candidatos clasificados." /> : (
            <>
              <ol className="divide-y divide-slate-100">
                {x.top.map((t, i) => (
                  <li key={t.sessionId} className="flex items-center gap-4 py-2.5">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${i === 0 ? "bg-asigbo-green text-asigbo-blue-dark" : "bg-slate-100 text-slate-700"}`}>{i + 1}</span>
                    <Link href={`/admin/results/${t.sessionId}`} className="min-w-0 flex-1 truncate font-medium hover:text-asigbo-blue hover:underline">{t.name}</Link>
                    {t.flagCount > 0 && <span className="text-xs font-medium text-amber-800">{t.flagCount} infr.</span>}
                    <span className="w-14 text-right font-bold tabular-nums">{t.index.toFixed(1)}</span>
                  </li>
                ))}
              </ol>
              <Link href={`/admin/ranking${x.topExam ? `?e=${x.topExam.id}` : ""}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-asigbo-blue hover:underline"><Trophy className="h-4 w-4" aria-hidden="true" /> Ver ranking completo</Link>
            </>
          )}
        </Panel>
      </div>

      <section className={`${card} p-6`}>
        <h2 className="font-semibold">Histórico por convocatoria</h2>
        <p className="mb-4 mt-0.5 text-sm text-slate-600">Promedio de aciertos año con año; los datos de convocatorias anteriores se conservan siempre.</p>
        {years.length > 1 && <LineChart label="Promedio de aciertos por convocatoria" unit="%" yMax={100} tableCols={["Convocatoria", "Promedio de aciertos"]} data={years.map((h) => ({ label: String(h.year), value: h.avgPct! }))} />}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3 font-semibold">Convocatoria</th><th className="px-4 py-3 text-right font-semibold">Aspirantes</th><th className="px-4 py-3 text-right font-semibold">Entregaron</th><th className="px-4 py-3 text-right font-semibold">Finalización</th><th className="px-4 py-3 text-right font-semibold">Promedio</th><th className="px-4 py-3 text-right font-semibold">Fraude</th></tr>
            </thead>
            <tbody>
              {data.history.map((h) => (
                <tr key={h.id} className={`border-t border-slate-100 ${h.id === s.id ? "bg-asigbo-blue/5" : ""}`}>
                  <td className="px-4 py-3"><Link href={`/admin/dashboard?c=${h.id}`} className="font-medium hover:text-asigbo-blue hover:underline">{h.name}</Link><span className="ml-2 text-xs text-slate-500">{h.year}{h.status === "ARCHIVED" ? " · archivada" : ""}</span></td>
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
