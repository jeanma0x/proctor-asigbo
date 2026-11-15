import { Suspense } from "react";
import Image from "next/image";
import { Eye, ShieldCheck, Timer, type LucideIcon } from "lucide-react";
import LoginForm from "@/components/admin/LoginForm";

export const metadata = { title: "Acceso administrativo · ASIGBO Proctoring" };

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ShieldCheck, title: "Evaluación segura", text: "Modo kiosko y registro de incidencias en cada examen." },
  { icon: Eye, title: "Monitoreo en vivo", text: "Sigue a los aspirantes en tiempo real durante la prueba." },
  { icon: Timer, title: "Resultados al instante", text: "Autoguardado y calificación automática de respuestas." },
];

/** Patrón de hexágonos (guiño al isotipo de ASIGBO) como fondo decorativo. */
function HexPattern() {
  return (
    <svg aria-hidden="true" className="absolute inset-0 h-full w-full opacity-[0.12]">
      <defs>
        <pattern id="hex" width="56" height="97" patternUnits="userSpaceOnUse" patternTransform="scale(1.1)">
          <path
            d="M28 2 54 17v30L28 62 2 47V17z M28 64 54 79v30 M28 64 2 79v30"
            fill="none"
            stroke="white"
            strokeWidth="1.2"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex)" />
    </svg>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-slate-50">
      {/* Panel de marca (solo escritorio) */}
      <section className="relative hidden w-1/2 max-w-[720px] flex-col justify-between overflow-hidden bg-gradient-to-br from-asigbo-blue via-asigbo-blue to-[#0f2159] p-12 text-white lg:flex">
        <HexPattern />
        <div aria-hidden="true" className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-asigbo-cyan/30 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-asigbo-green/20 blur-3xl" />

        <p className="relative text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">ASIGBO Proctoring</p>

        <div className="relative">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Evaluaciones de becas,
            <br />
            <span className="text-asigbo-green">transparentes y seguras.</span>
          </h2>
          <ul className="mt-10 space-y-6">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
                  <Icon className="h-5 w-5 text-asigbo-green" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-blue-100/80">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-blue-200/70">Asociación de Becados Isabel Gutiérrez de Bosch</p>
      </section>

      {/* Formulario */}
      <section className="relative flex flex-1 items-center justify-center px-4 py-10">
        {/* Fondo para móvil / tablet y acento de color */}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100" />
        <div aria-hidden="true" className="absolute -right-20 top-10 h-72 w-72 rounded-full bg-asigbo-cyan/20 blur-3xl" />
        <div aria-hidden="true" className="absolute -left-16 bottom-0 h-72 w-72 rounded-full bg-asigbo-blue/15 blur-3xl" />

        <div className="animate-fade-up relative w-full max-w-md rounded-2xl border border-white bg-white p-8 shadow-2xl shadow-asigbo-blue/10 sm:p-10">
          <div className="mb-6 flex justify-center">
            <Image alt="ASIGBO Logo" height={80} src="/logo-asigbo.png" width={200} priority className="h-20 w-auto" />
          </div>
          <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900">Bienvenido</h1>
          <p className="mb-8 mt-1 text-center text-sm text-slate-600">Ingresa tus credenciales para acceder al panel</p>
          <Suspense>
            <LoginForm />
          </Suspense>
          <p className="mt-8 border-t border-slate-100 pt-5 text-center text-xs text-slate-500">
            Acceso exclusivo para la Junta Directiva de ASIGBO
          </p>
        </div>
      </section>
    </main>
  );
}
