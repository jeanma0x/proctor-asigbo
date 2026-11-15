"use client";

import { useState, type FormEvent } from "react";
import { signOut } from "next-auth/react";
import { CheckCircle2, Loader2, LogOut, Monitor, UserRound } from "lucide-react";
import { signOutEverywhere, updateProfileName } from "@/actions/account";
import { btnGhost, btnPrimary, card, inputCls } from "@/components/admin/ui";
import ChangePasswordForm from "@/components/admin/ChangePasswordForm";
import { fmtDateTime, initials } from "@/lib/format";

type Props = { name: string | null; email: string; createdAt: string; lastLoginAt: string | null };

export default function AccountPanel({ name, email, createdAt, lastLoginAt }: Props) {
  const [value, setValue] = useState(name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [closing, setClosing] = useState(false);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const res = await updateProfileName(value);
    setSaving(false);
    setSaved(res.ok);
  }

  async function closeAll() {
    setClosing(true);
    const res = await signOutEverywhere();
    if (res.ok) await signOut({ callbackUrl: "/admin/login?changed=1" });
    else setClosing(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className={`${card} p-6`}>
        <div className="mb-5 flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-asigbo-blue text-lg font-bold text-white">
            {initials(name, email)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{name || email.split("@")[0]}</p>
            <p className="truncate text-sm text-slate-600">{email}</p>
          </div>
        </div>
        <dl className="mb-5 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Miembro desde</dt>
            <dd className="mt-0.5 font-medium">{fmtDateTime(createdAt)}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Último ingreso</dt>
            <dd className="mt-0.5 font-medium">{fmtDateTime(lastLoginAt)}</dd>
          </div>
        </dl>
        <form onSubmit={saveName} className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label htmlFor="display-name" className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <UserRound className="h-4 w-4" aria-hidden="true" /> Nombre para mostrar
            </label>
            <input id="display-name" value={value} maxLength={80} onChange={(e) => { setValue(e.target.value); setSaved(false); }} className={`${inputCls} mt-1`} placeholder="Ej. María López" />
          </div>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Guardar
          </button>
          {saved && (
            <span role="status" className="flex items-center gap-1 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Guardado
            </span>
          )}
        </form>
      </section>

      <ChangePasswordForm />

      <section className={`${card} flex flex-wrap items-center justify-between gap-4 p-6`}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Monitor className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold">Sesiones activas</h2>
            <p className="text-sm text-slate-600">¿Iniciaste sesión en un equipo ajeno? Ciérrala en todos los dispositivos.</p>
          </div>
        </div>
        <button type="button" onClick={closeAll} disabled={closing} className={btnGhost}>
          {closing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
          Cerrar en todos los dispositivos
        </button>
      </section>
    </div>
  );
}
