/** Esqueletos de carga: mantienen la forma de la pantalla mientras llegan los datos (sin saltos de layout). */
export function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/80 motion-reduce:animate-none ${className}`} aria-hidden="true" />;
}

export function PageHeaderSkeleton() {
  return (
    <div className="mb-8 flex items-start gap-4" aria-hidden="true">
      <Bone className="hidden h-12 w-12 rounded-2xl sm:block" />
      <div className="space-y-2.5"><Bone className="h-3 w-24" /><Bone className="h-7 w-64" /><Bone className="h-4 w-96 max-w-full" /></div>
    </div>
  );
}

export function StatCardsSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Bone className="h-11 w-11 rounded-xl" /><div className="space-y-2"><Bone className="h-6 w-14" /><Bone className="h-3 w-28" /></div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-hidden="true">
      <div className="flex gap-3 border-b border-slate-100 p-4"><Bone className="h-9 w-48" /><Bone className="h-9 flex-1" /><Bone className="h-9 w-32" /></div>
      <div className="bg-slate-50 px-5 py-3"><div className="flex gap-6">{Array.from({ length: cols }, (_, i) => <Bone key={i} className="h-3 flex-1" />)}</div></div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 border-t border-slate-100 px-5 py-4">
          {Array.from({ length: cols }, (_, c) => <Bone key={c} className={`h-4 flex-1 ${c === 0 ? "max-w-56" : ""}`} />)}
        </div>
      ))}
    </div>
  );
}

export function ChartsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><Bone className="mb-4 h-4 w-40" /><Bone className="h-44 w-full" /></div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ variant = "table" }: { variant?: "table" | "dashboard" }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10" role="status" aria-label="Cargando…">
      <PageHeaderSkeleton />
      <div className="space-y-6">
        <StatCardsSkeleton />
        {variant === "dashboard" ? <ChartsSkeleton /> : <TableSkeleton />}
      </div>
      <span className="sr-only">Cargando…</span>
    </main>
  );
}

/** Filas de esqueleto para tablas que cargan por SWR (reemplaza al spinner solitario). */
export function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="border-t border-slate-100" aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className={c === 0 ? "px-6 py-4" : "px-4 py-4"}><Bone className={`h-4 ${c === 0 ? "w-40" : "w-full max-w-24"}`} /></td>
          ))}
        </tr>
      ))}
    </>
  );
}
