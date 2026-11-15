import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Evaluación de becas · ASIGBO",
  description: "Plataforma de evaluación de la Asociación de Becados Isabel Gutiérrez de Bosch.",
};

/** Página pública: quien llega sin enlace personal (o con el dominio a secas) sabe qué hacer; el panel queda como acceso discreto. */
export default function Home() {
  return (
    <div className="min-h-screen bg-paper text-slate-900">
      <div className="flex h-1.5" aria-hidden="true">
        <span className="flex-1 bg-asigbo-blue" /><span className="flex-1 bg-asigbo-cyan" /><span className="flex-1 bg-asigbo-green" /><span className="flex-1 bg-asigbo-orange" />
      </div>
      <main className="mx-auto flex min-h-[calc(100vh-6px)] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
        <Image alt="ASIGBO" src="/logo-asigbo.png" width={220} height={67} priority className="h-16 w-auto" />
        <h1 className="mt-10 font-serif text-3xl font-semibold leading-tight sm:text-4xl">Evaluación de becas ASIGBO</h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-700">
          Para presentar tu examen necesitas tu <strong>enlace personal</strong>. Lo recibiste en el correo (o por WhatsApp) que te envió la Asociación.
        </p>
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left text-base text-slate-700">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-asigbo-blue" aria-hidden="true" />
          <span>Si no lo encuentras, revisa tu carpeta de spam o escribe a la Junta Directiva para que te lo reenvíen.</span>
        </p>
        <Link href="/admin/login" className="mt-12 text-sm text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline">Acceso para la Junta Directiva</Link>
      </main>
    </div>
  );
}
