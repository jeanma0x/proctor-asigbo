"use client";

/**
 * Gráficos SVG/HTML propios del panel. Reglas (guía dataviz): una sola tonalidad (azul ASIGBO) para magnitudes,
 * naranja solo como énfasis, marcas finas (barras ≤ 24 px con extremo redondeado de 4 px), grilla en hairline,
 * texto en tinta (nunca en el color de la serie), tooltip al pasar el mouse y tabla alternativa accesible.
 */
import { useId, useState, type ReactNode } from "react";

export type { ReactNode };

export const INK = "#0f172a";
export const MUTED = "#64748b";
export const GRID = "#e2e8f0";
export const BLUE = "#1e3a8a";
export const BLUE_MID = "#6f8ad0";
export const BLUE_WASH = "#dbe3f7";
export const ACCENT = "#ea580c";
export const NEUTRAL = "#cbd5e1";

type Pt = { label: string; value: number };

function niceMax(v: number) {
  // Para conteos pequeños: múltiplos de 4 (ticks enteros 0 / 2 / 4, 0 / 4 / 8) en vez de 0 / 3 / 5.
  if (v <= 8) return Math.max(4, Math.ceil(v / 4) * 4);
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Tabla equivalente del gráfico (accesibilidad: el dato nunca depende solo del dibujo). */
export function DataTable({ rows, cols }: { rows: (string | number)[][]; cols: string[] }) {
  return (
    <details className="mt-3 text-xs text-slate-600">
      <summary className="cursor-pointer select-none font-medium text-slate-500 hover:text-slate-800">Ver como tabla</summary>
      <table className="mt-2 w-full text-left">
        <thead><tr>{cols.map((c) => <th key={c} className="border-b border-slate-200 py-1 pr-3 font-semibold">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border-b border-slate-100 py-1 pr-3 tabular-nums">{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}

/* ───────── Columnas ───────── */
export function ColumnChart({ data, label, unit = "", height = 190, tableCols, markerAt, markerLabel, highlightLast = false, emphasize }: {
  data: Pt[]; label: string; unit?: string; height?: number; tableCols?: [string, string];
  markerAt?: number | null; markerLabel?: string; highlightLast?: boolean; emphasize?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = height, L = 34, R = 8, T = 16, B = 30;
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const slot = (W - L - R) / data.length;
  const bw = Math.min(24, slot * 0.62);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const cols = tableCols ?? ["Categoría", "Valor"];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={MUTED}>{Math.round(t)}{unit}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = L + slot * i + (slot - bw) / 2;
          const h = Math.max(d.value > 0 ? 3 : 0, (H - T - B) * (d.value / max));
          const strong = emphasize != null ? i === emphasize : highlightLast ? i === data.length - 1 : true;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={L + slot * i} y={T} width={slot} height={H - T - B} fill="transparent" />
              {/* extremo superior redondeado (4 px), base recta sobre el eje */}
              <path d={`M${x},${y(0)} V${y(0) - h + 4} Q${x},${y(0) - h} ${x + 4},${y(0) - h} H${x + bw - 4} Q${x + bw},${y(0) - h} ${x + bw},${y(0) - h + 4} V${y(0)} Z`} fill={strong ? BLUE : NEUTRAL} opacity={hover != null && hover !== i ? 0.55 : 1} />
              <text x={x + bw / 2} y={H - B + 14} textAnchor="middle" fontSize={9.5} fill={MUTED}>{d.label}</text>
              {d.value > 0 && (hover === i || d.value === Math.max(...data.map((z) => z.value))) && <text x={x + bw / 2} y={y(d.value) - 5} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={INK}>{d.value}</text>}
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#94a3b8" strokeWidth={1} />
        {markerAt != null && (
          <g>
            <line x1={L + (markerAt / 100) * (W - L - R)} x2={L + (markerAt / 100) * (W - L - R)} y1={T} y2={H - B} stroke={ACCENT} strokeWidth={2} />
            <text x={L + (markerAt / 100) * (W - L - R) + 5} y={T + 8} fontSize={10} fontWeight={600} fill={INK}>{markerLabel}</text>
          </g>
        )}
      </svg>
      {hover != null && (
        <div role="tooltip" className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: `${((L + slot * hover + slot / 2) / W) * 100}%` }}>
          {data[hover].label}: <strong>{data[hover].value}</strong>
        </div>
      )}
      <DataTable cols={cols} rows={data.map((d) => [d.label, d.value])} />
    </div>
  );
}

/* ───────── Línea (con área tenue) ───────── */
export function LineChart({ data, label, unit = "", height = 190, yMax, tableCols }: { data: Pt[]; label: string; unit?: string; height?: number; yMax?: number; tableCols?: [string, string] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = height, L = 34, R = 56, T = 16, B = 30;
  const max = yMax ?? niceMax(Math.max(...data.map((d) => d.value), 1));
  const xs = (i: number) => (data.length === 1 ? L + (W - L - R) / 2 : L + ((W - L - R) * i) / (data.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const path = data.map((d, i) => `${i ? "L" : "M"}${xs(i)},${y(d.value)}`).join(" ");
  const area = `${path} L${xs(data.length - 1)},${y(0)} L${xs(0)},${y(0)} Z`;
  const last = data[data.length - 1];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={MUTED}>{Math.round(t)}{unit}</text>
          </g>
        ))}
        {data.length > 1 && <path d={area} fill={BLUE} opacity={0.1} />}
        {data.length > 1 && <path d={path} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {data.map((d, i) => (
          <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={xs(i) - 18} y={T} width={36} height={H - T - B} fill="transparent" />
            <circle cx={xs(i)} cy={y(d.value)} r={hover === i ? 6 : 4.5} fill={BLUE} stroke="#fff" strokeWidth={2} />
            {(data.length <= 8 || i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) && <text x={xs(i)} y={H - B + 14} textAnchor="middle" fontSize={9.5} fill={MUTED}>{d.label}</text>}
          </g>
        ))}
        <text x={xs(data.length - 1) + 10} y={y(last.value) + 4} fontSize={11} fontWeight={700} fill={INK}>{Math.round(last.value * 10) / 10}{unit}</text>
      </svg>
      {hover != null && (
        <div role="tooltip" className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: `${(xs(hover) / W) * 100}%` }}>
          {data[hover].label}: <strong>{Math.round(data[hover].value * 10) / 10}{unit}</strong>
        </div>
      )}
      <DataTable cols={tableCols ?? ["Periodo", "Valor"]} rows={data.map((d) => [d.label, `${Math.round(d.value * 10) / 10}${unit}`])} />
    </div>
  );
}

/* ───────── Dispersión: tiempo usado vs aciertos ───────── */
export function ScatterChart({ points, label }: { points: { name: string; x: number; y: number; flagged: boolean }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 260, L = 40, R = 14, T = 12, B = 38;
  const px = (v: number) => L + ((W - L - R) * Math.min(v, 110)) / 110;
  const py = (v: number) => T + (H - T - B) * (1 - v / 100);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={py(t)} y2={py(t)} stroke={GRID} strokeWidth={1} />
            <text x={L - 6} y={py(t) + 3} textAnchor="end" fontSize={10} fill={MUTED}>{t}%</text>
          </g>
        ))}
        {[0, 25, 50, 75, 100].map((t) => <text key={t} x={px(t)} y={H - B + 14} textAnchor="middle" fontSize={10} fill={MUTED}>{t}%</text>)}
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" fontSize={10.5} fill={MUTED}>Tiempo usado (% del asignado)</text>
        <text transform={`translate(11 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10.5} fill={MUTED}>Aciertos</text>
        {points.map((p, i) => (
          <circle key={i} cx={px(p.x)} cy={py(p.y)} r={hover === i ? 7 : 5} fill={p.flagged ? ACCENT : BLUE} fillOpacity={0.85} stroke="#fff" strokeWidth={2} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover != null && (
        <div role="tooltip" className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: `${(px(points[hover].x) / W) * 100}%`, top: `${(py(points[hover].y) / H) * 100}%` }}>
          <strong>{points[hover].name}</strong><br />{Math.round(points[hover].y)}% aciertos · {Math.round(points[hover].x)}% del tiempo{points[hover].flagged ? " · con infracciones" : ""}
        </div>
      )}
      <div className="mt-1 flex items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: BLUE }} /> Sin infracciones</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCENT }} /> Con infracciones</span>
      </div>
      <DataTable cols={["Candidato", "Aciertos %", "Tiempo %", "Infracciones"]} rows={points.map((p) => [p.name, Math.round(p.y), Math.round(p.x), p.flagged ? "Sí" : "No"])} />
    </div>
  );
}

/* ───────── Barras horizontales ordenadas ───────── */
export function HBars({ items, label, suffix = "", max }: { items: { key: string; label: string; value: number; sub?: string }[]; label: string; suffix?: string; max?: number }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul aria-label={label} className="space-y-3">
      {items.map((i) => (
        <li key={i.key} className="text-sm">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-slate-800" title={i.label}>{i.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{i.value}{suffix}{i.sub && <span className="ml-1.5 text-xs font-normal text-slate-500">{i.sub}</span>}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(i.value / top) * 100}%`, background: BLUE }} /></div>
        </li>
      ))}
    </ul>
  );
}

/* ───────── Barra segmentada (reparto de un total) ───────── */
export function SegmentedBar({ parts, label }: { parts: { key: string; label: string; value: number; color: string }[]; label: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-9 gap-0.5 overflow-hidden rounded-lg" role="img" aria-label={label}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.key} className="flex items-center justify-center text-xs font-bold" style={{ width: `${(p.value / total) * 100}%`, background: p.color, color: p.color === NEUTRAL || p.color === BLUE_WASH ? INK : "#fff" }} title={`${p.label}: ${p.value}`}>
            {(p.value / total) * 100 >= 9 ? p.value : ""}
          </div>
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-700">
        {parts.map((p) => <li key={p.key} className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} /> {p.label} <span className="ml-auto font-semibold tabular-nums">{p.value}</span></li>)}
      </ul>
    </div>
  );
}

/* ───────── Medidor (una razón contra su límite) ───────── */
export function Meter({ value, label, tone = BLUE }: { value: number; label: string; tone?: string }) {
  const id = useId();
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-labelledby={id} className="h-1.5 overflow-hidden rounded-full bg-slate-100">
      <span id={id} className="sr-only">{label}</span>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: tone }} />
    </div>
  );
}
