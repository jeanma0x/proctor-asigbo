import Link from "next/link";
import { Lock } from "lucide-react";
import { getAdmin } from "@/lib/require-admin";
import { can, ROLE_INFO, type Permission } from "@/lib/permissions";

/** Muestra el contenido solo si el rol del usuario tiene el permiso; si no, un aviso claro (no un 404). */
export default async function Gate({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const admin = await getAdmin();
  if (!admin) return null; // el shell ya redirige al login
  if (can(admin.role, permission)) return <>{children}</>;
  return (
    <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Lock className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold">No tienes acceso a esta sección</h2>
      <p className="mt-1 text-sm text-slate-600">
        Tu rol actual es <strong>{ROLE_INFO[admin.role].label}</strong>. Si necesitas este acceso, pídelo a un superadmin.
      </p>
      <Link href="/admin/dashboard" className="mt-5 inline-block text-sm font-semibold text-asigbo-blue underline">Volver al dashboard</Link>
    </div>
  );
}
