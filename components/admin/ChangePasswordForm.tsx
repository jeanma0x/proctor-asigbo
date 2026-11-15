"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { changePassword } from "@/actions/account";

const inputClass =
  "block w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-3 pr-11 text-sm text-slate-900 outline-none transition-colors focus:border-asigbo-blue focus:ring-2 focus:ring-asigbo-blue/30";

function Field({ id, label, hint, autoComplete }: { id: string; label: string; hint?: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
      <div className="relative mt-1">
        <input id={id} name={id} type={show ? "text" : "password"} autoComplete={autoComplete} required className={inputClass} />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-xl text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-asigbo-blue"
        >
          {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default function ChangePasswordForm() {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    setStatus(null);
    setLoading(true);
    const res = await changePassword(
      String(f.get("current") ?? ""),
      String(f.get("next") ?? ""),
      String(f.get("confirm") ?? ""),
    );
    setLoading(false);
    if (res.ok) {
      formEl.reset();
      setStatus({ ok: true, message: "Contraseña actualizada correctamente." });
    } else {
      setStatus({ ok: false, message: res.error });
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-asigbo-blue/10 text-asigbo-blue">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="font-semibold text-slate-900">Cambiar contraseña</h2>
      </div>

      {status && (
        <div
          role={status.ok ? "status" : "alert"}
          className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${
            status.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {status.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>{status.message}</span>
        </div>
      )}

      <Field id="current" label="Contraseña actual" autoComplete="current-password" />
      <Field id="next" label="Nueva contraseña" autoComplete="new-password" hint="Mínimo 10 caracteres, con mayúsculas, minúsculas y números." />
      <Field id="confirm" label="Confirmar nueva contraseña" autoComplete="new-password" />

      <button
        type="submit"
        disabled={loading}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-asigbo-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-asigbo-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {loading ? "Guardando…" : "Actualizar contraseña"}
      </button>
    </form>
  );
}
