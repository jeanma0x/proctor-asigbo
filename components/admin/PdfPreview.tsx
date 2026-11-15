"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, ShieldAlert, X } from "lucide-react";
import { btnPrimary } from "@/components/admin/ui";

/** Botón que abre una vista previa del PDF; desde ahí se puede descargar. Nada se descarga al primer clic. */
export default function PdfPreview({
  href, title, className, label, children,
}: { href: string; title: string; className: string; label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const sep = href.includes("?") ? "&" : "?";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <button type="button" className={className} aria-label={label} title={label} onClick={() => { setLoaded(false); setOpen(true); }}>{children}</button>
      {open && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Vista previa: ${title}`}>
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="relative flex h-full max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold text-slate-900">Vista previa · {title}</h2>
                <p className="flex items-center gap-1.5 text-xs text-slate-500"><ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Contiene datos personales; la descarga queda registrada en la bitácora.</p>
              </div>
              <div className="flex items-center gap-2">
                <a href={`${href}${sep}download=1`} className={btnPrimary}><Download className="h-4 w-4" aria-hidden="true" /> Descargar PDF</a>
                <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar vista previa" className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" aria-hidden="true" /></button>
              </div>
            </header>
            <div className="relative flex-1 bg-slate-100">
              {!loaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-slate-500" role="status">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> Generando vista previa…
                  <div className="h-1.5 w-48 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-1/3 animate-[pdfbar_1.2s_ease-in-out_infinite] rounded-full bg-asigbo-blue motion-reduce:animate-none" /></div>
                </div>
              )}
              <iframe src={`${href}${sep}preview=1#toolbar=0&navpanes=0`} title={`Vista previa: ${title}`} onLoad={() => setLoaded(true)} className="h-full w-full" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
