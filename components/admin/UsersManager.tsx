"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Copy, KeyRound, Loader2, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { createAdmin, deleteAdmin, resetAdminPassword } from "@/actions/users";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/admin/ui";
import { fmtDateTime, initials } from "@/lib/format";
import { generatePassword } from "@/lib/password";

type Row = {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
};

type Credentials = { email: string; password: string; reset: boolean };

export default function UsersManager({ me, admins }: { me: string; admins: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<{ id: string; kind: "delete" | "reset" } | null>(null);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("No se pudo copiar. Selecciona el texto manualmente.");
    }
  };

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreds(null);
    startTransition(async () => {
      const res = await createAdmin({ name, email, password });
      if (!res.ok) return setError(res.error);
      setCreds({ email: email.trim().toLowerCase(), password, reset: false });
      setName("");
      setEmail("");
      setPassword(generatePassword());
      router.refresh();
    });
  };

  const onConfirm = (row: Row, kind: "delete" | "reset") => {
    setError(null);
    setCreds(null);
    setConfirming(null);
    startTransition(async () => {
      if (kind === "delete") {
        const res = await deleteAdmin(row.id);
        if (!res.ok) return setError(res.error);
      } else {
        const pw = generatePassword();
        const res = await resetAdminPassword(row.id, pw);
        if (!res.ok) return setError(res.error);
        setCreds({ email: row.email, password: pw, reset: true });
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </div>
      )}

      {creds && (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="font-semibold text-emerald-900">
            {creds.reset ? "Contraseña restablecida" : "Administrador creado"} — comparte estas credenciales de forma segura
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            Esta contraseña es temporal y <strong>no volverá a mostrarse</strong>. Se pedirá cambiarla en el primer ingreso.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 text-sm">
            <div className="min-w-0 flex-1 font-mono">
              <p className="truncate">Correo: {creds.email}</p>
              <p>Contraseña: {creds.password}</p>
            </div>
            <button type="button" className={btnGhost} onClick={() => copy(`Correo: ${creds.email}\nContraseña temporal: ${creds.password}`)}>
              {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      <section className={`${card} p-6`}>
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <UserPlus className="h-5 w-5 text-asigbo-blue" aria-hidden="true" /> Agregar administrador
        </h2>
        <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="u-name" className="text-sm font-medium text-slate-700">Nombre (opcional)</label>
            <input id="u-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`${inputCls} mt-1`} placeholder="Ej. Ana Pérez" />
          </div>
          <div>
            <label htmlFor="u-email" className="text-sm font-medium text-slate-700">Correo electrónico</label>
            <input id="u-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} mt-1`} placeholder="persona@correo.com" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="u-pass" className="text-sm font-medium text-slate-700">Contraseña temporal</label>
            <div className="mt-1 flex gap-2">
              <input id="u-pass" required value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} font-mono`} />
              <button type="button" className={btnGhost} onClick={() => setPassword(generatePassword())} aria-label="Generar otra contraseña">
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Generar
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">La persona deberá cambiarla al ingresar por primera vez.</p>
          </div>
          <div className="md:col-span-2">
            <button type="submit" disabled={pending} className={btnPrimary}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
              Crear administrador
            </button>
          </div>
        </form>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-semibold">{admins.length} administrador(es) con acceso</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3 font-semibold">Usuario</th>
                <th className="px-4 py-3 font-semibold">Último ingreso</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const isMe = a.id === me;
                const c = confirming?.id === a.id ? confirming.kind : null;
                return (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-asigbo-blue/10 text-xs font-bold text-asigbo-blue">
                          {initials(a.name, a.email)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {a.name || a.email.split("@")[0]}
                            {isMe && <span className="ml-2 rounded-full bg-asigbo-blue px-2 py-0.5 text-xs font-semibold text-white">Tú</span>}
                          </p>
                          <p className="truncate text-xs text-slate-500">{a.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDateTime(a.lastLoginAt)}</td>
                    <td className="px-4 py-3">
                      {a.mustChangePassword ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Contraseña temporal</span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Activo</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {isMe ? null : c ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-slate-600">{c === "delete" ? "¿Eliminar acceso?" : "¿Nueva contraseña?"}</span>
                          <button type="button" onClick={() => onConfirm(a, c)} disabled={pending} className="cursor-pointer rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50">
                            Confirmar
                          </button>
                          <button type="button" onClick={() => setConfirming(null)} className={`${btnGhost} !px-3 !py-1.5 text-xs`}>Cancelar</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => setConfirming({ id: a.id, kind: "reset" })} className={`${btnGhost} !px-3 !py-1.5 text-xs`}>
                            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> Restablecer
                          </button>
                          <button type="button" onClick={() => setConfirming({ id: a.id, kind: "delete" })} aria-label={`Eliminar a ${a.email}`} className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-red-600">
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
