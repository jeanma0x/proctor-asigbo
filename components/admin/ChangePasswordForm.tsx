"use client";

import { useMemo, useState, type FormEvent } from "react";
import { signOut } from "next-auth/react";
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { changePassword } from "@/actions/account";
import { btnPrimary, card, inputCls } from "@/components/admin/ui";

function Field({
  id, label, value, onChange, autoComplete,
}: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
      <div className="relative mt-1">
        <input
          id={id} name={id} type={show ? "text" : "password"} autoComplete={autoComplete} required
          value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-xl text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-asigbo-blue"
        >
          {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

/** Checklist en vivo de la política de contraseñas. */
function Rules({ value }: { value: string }) {
  const rules = useMemo(
    () => [
      { ok: value.length >= 10, label: "Al menos 10 caracteres" },
      { ok: /[a-z]/.test(value), label: "Una minúscula" },
      { ok: /[A-Z]/.test(value), label: "Una mayúscula" },
      { ok: /\d/.test(value), label: "Un número" },
    ],
    [value],
  );
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {rules.map((r) => (
        <li key={r.label} className={`flex items-center gap-1.5 ${r.ok ? "text-emerald-700" : "text-slate-500"}`}>
          <Check className={`h-3.5 w-3.5 ${r.ok ? "opacity-100" : "opacity-30"}`} aria-hidden="true" /> {r.label}
        </li>
      ))}
    </ul>
  );
}

export default function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await changePassword(current, next, confirm);
    if (!res.ok) {
      setLoading(false);
      setError(res.error);
      return;
    }
    // Por seguridad, el cambio invalida todas las sesiones: se vuelve a iniciar sesión.
    setDone(true);
    setTimeout(() => signOut({ callbackUrl: "/admin/login?changed=1" }), 1600);
  }

  return (
    <form onSubmit={onSubmit} className={`${card} max-w-2xl space-y-5 p-6`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-asigbo-blue/10 text-asigbo-blue">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">{forced ? "Elige tu nueva contraseña" : "Cambiar contraseña"}</h2>
          <p className="text-xs text-slate-500">Al guardar se cerrarán todas tus sesiones y deberás ingresar de nuevo.</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> <span>{error}</span>
        </div>
      )}
      {done && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> <span>Contraseña actualizada. Redirigiendo al inicio de sesión…</span>
        </div>
      )}

      <Field id="current" label={forced ? "Contraseña temporal" : "Contraseña actual"} value={current} onChange={setCurrent} autoComplete="current-password" />
      <div>
        <Field id="next" label="Nueva contraseña" value={next} onChange={setNext} autoComplete="new-password" />
        <Rules value={next} />
      </div>
      <div>
        <Field id="confirm" label="Confirmar nueva contraseña" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {confirm && confirm !== next && <p className="mt-1 text-xs text-red-600">Las contraseñas no coinciden.</p>}
      </div>

      <button type="submit" disabled={loading || done} className={`${btnPrimary} w-full`}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {loading ? "Guardando…" : "Actualizar contraseña"}
      </button>
    </form>
  );
}
