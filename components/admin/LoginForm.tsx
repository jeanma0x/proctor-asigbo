"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-asigbo-blue focus:ring-2 focus:ring-asigbo-blue/30";

/** Solo rutas internas de /admin, para evitar open-redirect. */
function safeCallback(raw: string | null) {
  return raw && raw.startsWith("/admin") && !raw.startsWith("//") ? raw : "/admin/exam-builder";
}

export default function LoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        setError("Correo o contraseña incorrectos.");
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
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      <div>
        <label htmlFor="email" className="text-sm font-medium text-slate-700">Correo electrónico</label>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} placeholder="admin@asigbo.org" />
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-medium text-slate-700">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-asigbo-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-asigbo-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-asigbo-blue disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {loading ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
