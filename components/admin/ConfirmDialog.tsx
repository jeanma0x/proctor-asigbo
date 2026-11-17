"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { btnGhost, btnPrimary } from "@/components/admin/ui";

/** Modal de confirmación común: Esc cancela, el foco inicia en «Cancelar» (la opción segura) y se queda dentro del diálogo. */
export default function ConfirmDialog({
  open, title, description, confirmLabel = "Confirmar", tone = "primary", busy = false, requireText, onConfirm, onCancel,
}: {
  open: boolean; title: string; description: React.ReactNode; confirmLabel?: string;
  tone?: "primary" | "danger"; busy?: boolean; requireText?: string; onConfirm: () => void; onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!open) setTyped(""); }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { e.stopPropagation(); onCancel(); }
      if (e.key === "Tab" && boxRef.current) {
        const f = boxRef.current.querySelectorAll<HTMLElement>("button:not([disabled])");
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); prev?.focus?.(); };
  }, [open, busy, onCancel]);

  if (!open) return null;
  const danger = tone === "danger";
  const Icon = danger ? AlertTriangle : Info;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="cd-title" aria-describedby="cd-desc">
      <div className="absolute inset-0 bg-slate-900/50" onClick={() => !busy && onCancel()} aria-hidden="true" />
      <div ref={boxRef} className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${danger ? "bg-red-100 text-red-600" : "bg-asigbo-blue/10 text-asigbo-blue"}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 id="cd-title" className="text-lg font-semibold text-slate-900">{title}</h2>
            <div id="cd-desc" className="mt-1 text-sm leading-relaxed text-slate-600">{description}</div>
          </div>
        </div>
        {requireText && (
          <div className="mt-4">
            <label htmlFor="cd-typed" className="text-xs font-medium text-slate-700">Escribe exactamente <span className="font-mono font-semibold">{requireText}</span> para confirmar</label>
            <input id="cd-typed" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="mt-1 block w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-200" />
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className={btnGhost}>Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={busy || (!!requireText && typed.trim() !== requireText)} className={danger ? "inline-flex cursor-pointer items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50" : btnPrimary}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
