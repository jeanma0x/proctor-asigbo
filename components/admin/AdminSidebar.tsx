"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ClipboardList, KeyRound, LogOut, MonitorPlay, type LucideIcon } from "lucide-react";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin/exam-builder", label: "Constructor de Exámenes", icon: ClipboardList },
  { href: "/admin/sessions", label: "Gestión de Accesos", icon: KeyRound },
  { href: "/admin/live", label: "Monitoreo en Vivo", icon: MonitorPlay },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex shrink-0 flex-col bg-asigbo-blue text-blue-100 shadow-lg md:sticky md:top-0 md:h-screen md:w-64">
      {/* El logo tiene fondo claro: se presenta sobre una tarjeta blanca para mantener nitidez y contraste. */}
      <div className="p-4">
        <div className="flex items-center justify-center rounded-xl bg-white px-3 py-2.5 shadow-md">
          <Image
            alt="ASIGBO Logo"
            src="/logo-asigbo.png"
            width={150}
            height={46}
            priority
            className="h-auto w-[150px]"
          />
        </div>
        <p className="mt-3 text-center text-xs font-semibold uppercase tracking-widest text-blue-200">
          ASIGBO Proctoring
        </p>
      </div>

      <nav aria-label="Navegación principal" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-0 md:pt-2">
        <p className="mb-1 hidden px-3 text-xs font-semibold uppercase tracking-wider text-blue-300/70 md:block">
          Gestión
        </p>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 whitespace-nowrap rounded-lg border-l-4 px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-asigbo-green bg-white/15 text-white shadow-sm"
                  : "border-transparent text-blue-100 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-blue-100 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          Cerrar Sesión
        </button>
        <p className="mt-2 hidden px-3 text-xs text-blue-200/70 md:block">
          Evaluación de becas · Junta Directiva
        </p>
      </div>
    </aside>
  );
}
