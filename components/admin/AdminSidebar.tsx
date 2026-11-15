"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  CalendarRange, ClipboardCheck, ClipboardList, KeyRound, LayoutDashboard, LogOut, MonitorPlay, ShieldCheck, UserCog, Users,
  type LucideIcon,
} from "lucide-react";
import { initials } from "@/lib/format";
import { can, ROLE_INFO, type Permission, type Role } from "@/lib/permissions";

type NavItem = { href: string; label: string; icon: LucideIcon; permission?: Permission };

const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Resumen", items: [{ href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard:view" }] },
  {
    title: "Operación",
    items: [
      { href: "/admin/exam-builder", label: "Constructor de Exámenes", icon: ClipboardList, permission: "exams:write" },
      { href: "/admin/sessions", label: "Enlaces de Acceso", icon: KeyRound, permission: "sessions:manage" },
      { href: "/admin/live", label: "Monitoreo en Vivo", icon: MonitorPlay, permission: "live:view" },
    ],
  },
  {
    title: "Histórico",
    items: [
      { href: "/admin/convocatorias", label: "Convocatorias", icon: CalendarRange, permission: "dashboard:view" },
      { href: "/admin/results", label: "Resultados", icon: ClipboardCheck, permission: "results:view" },
    ],
  },
  {
    title: "Administración",
    items: [
      { href: "/admin/users", label: "Usuarios y Roles", icon: Users, permission: "users:manage" },
      { href: "/admin/account", label: "Mi cuenta", icon: UserCog },
    ],
  },
];

export default function AdminSidebar({ user }: { user: { name: string | null; email: string; role: Role } | null }) {
  const pathname = usePathname();

  return (
    <aside className="flex shrink-0 flex-col bg-asigbo-blue text-blue-100 shadow-lg md:sticky md:top-0 md:h-screen md:w-64">
      {/* El logo tiene fondo claro: se presenta sobre una tarjeta blanca para mantener nitidez y contraste. */}
      <div className="p-4">
        <div className="flex items-center justify-center rounded-xl bg-white px-3 py-2.5 shadow-md">
          <Image alt="ASIGBO Logo" src="/logo-asigbo.png" width={150} height={46} priority className="h-auto w-[150px]" />
        </div>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-blue-200">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Proctoring
        </p>
      </div>

      <nav aria-label="Navegación principal" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-y-auto md:pb-0 md:pt-2">
        {GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || !user || can(user.role, i.permission)) }))
          .filter((g) => g.items.length > 0)
          .map((group, gi) => (
          <div key={group.title} className="flex gap-1 md:flex-col">
            <p className={`mb-1 hidden px-3 text-xs font-semibold uppercase tracking-wider text-blue-300/70 md:block ${gi > 0 ? "mt-4" : ""}`}>
              {group.title}
            </p>
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 whitespace-nowrap rounded-lg border-l-4 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-white ${
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
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        {user && (
          <div className="mb-2 flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-asigbo-green text-xs font-bold text-asigbo-blue-dark">
              {initials(user.name, user.email)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{user.name || user.email.split("@")[0]}</p>
              <p className="truncate text-xs text-blue-200/80">{ROLE_INFO[user.role].label} · {user.email}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-blue-100 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
}
