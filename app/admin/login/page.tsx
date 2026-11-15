import { Suspense } from "react";
import Image from "next/image";
import LoginForm from "@/components/admin/LoginForm";

export const metadata = { title: "Acceso administrativo · ASIGBO Proctoring" };

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex justify-center">
          <Image alt="ASIGBO Logo" height={80} src="/logo-asigbo.png" width={200} priority className="h-20 w-auto" />
        </div>
        <h1 className="text-center text-xl font-bold text-slate-900">Panel de administración</h1>
        <p className="mb-6 mt-1 text-center text-sm text-slate-600">Acceso exclusivo para la Junta Directiva</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
