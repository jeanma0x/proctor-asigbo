import type { LucideIcon } from "lucide-react";

/** Contenedor común de todas las pantallas del panel: mismo ancho y mismo borde izquierdo. */
export function PageContainer({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-6xl px-4 py-8 text-slate-900 sm:px-8 sm:py-10">{children}</main>;
}

export function PageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <span className="mt-1 hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-asigbo-blue text-white shadow-lg shadow-asigbo-blue/25 sm:flex">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-asigbo-blue">{eyebrow}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">{description}</p>
        </div>
      </div>
      {actions}
    </header>
  );
}

/** Estilos compartidos para tarjetas e inputs (un único lenguaje visual). */
export const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
export const inputCls =
  "block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-asigbo-blue focus:ring-2 focus:ring-asigbo-blue/30 disabled:bg-slate-100 disabled:text-slate-500";
export const btnPrimary =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-asigbo-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-asigbo-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue disabled:cursor-not-allowed disabled:opacity-50";
export const btnGhost =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue disabled:cursor-not-allowed disabled:opacity-50";
