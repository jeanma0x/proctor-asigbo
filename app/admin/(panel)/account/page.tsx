import type { Metadata } from "next";
import ChangePasswordForm from "@/components/admin/ChangePasswordForm";

export const metadata: Metadata = { title: "Mi cuenta · ASIGBO Proctoring" };

export default function AccountPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold">Mi cuenta</h1>
        <p className="mt-1 text-sm text-slate-600">Actualiza la contraseña de acceso al panel de administración.</p>
        <ChangePasswordForm />
      </div>
    </main>
  );
}
