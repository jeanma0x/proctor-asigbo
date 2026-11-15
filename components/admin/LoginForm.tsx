"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, Loader2, Lock, Mail } from "lucide-react";

const inputClass =
  "block w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-asigbo-blue focus:ring-2 focus:ring-asigbo-blue/30";

/** Solo rutas internas de /admin, para evitar open-redirect. */
function safeCallback(raw: string | null) {
  return raw && raw.startsWith("/admin") && !raw.startsWith("//") ? raw : "/admin/exam-builder";
}

export default function LoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState("CapsLock"));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        redirect: false,
      });
      if (!res || res.error) {
        setError(
          res?.error === "TOO_MANY_ATTEMPTS"
            ? "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo."
            : "Correo o contraseña incorrectos.",
        );
        setLoading(false);
        return;
      }
      // Navegación completa para que el proxy vea la cookie de sesión recién creada.
      window.location.assign(safeCallback(params.get("callbackUrl")));
    } catch {
      setError("No se pudo iniciar sesión. Inténtalo de nuevo.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {params.has("changed") && !error && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Sesión cerrada por seguridad. Ingresa con tus credenciales actualizadas.</span>
        </div>
      )}
      {params.has("expired") && !error && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Tu sesión expiró o fue cerrada. Inicia sesión de nuevo.</span>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="email" className="text-sm font-medium text-slate-700">Correo electrónico</label>
        <div className="relative mt-1.5">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id="email" name="email" type="email" autoComplete="username" required autoFocus
            placeholder="correo@ejemplo.com" className={`${inputClass} pr-4`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-medium text-slate-700">Contraseña</label>
        <div className="relative mt-1.5">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required
            placeholder="••••••••" onKeyUp={onKey} onKeyDown={onKey} className={`${inputClass} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center rounded-r-xl text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-asigbo-blue"
          >
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        {capsLock && <p className="mt-1.5 text-xs font-medium text-amber-700">Bloq Mayús está activado.</p>}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-asigbo-blue px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-asigbo-blue/25 transition-colors hover:bg-asigbo-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {loading ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
