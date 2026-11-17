/** Roles y permisos del panel. Sin dependencias de servidor: se usa también en el cliente para ocultar opciones. */
export type Role = "SUPERADMIN" | "ADMIN" | "REVIEWER";

export type Permission =
  | "dashboard:view"
  | "results:view"
  | "ranking:view"
  | "ranking:decide"
  | "evaluation:write"
  | "results:grade"
  | "candidates:edit"
  | "results:export"
  | "live:view"
  | "live:terminate"
  | "exams:write"
  | "sessions:manage"
  | "convocatorias:manage"
  | "users:manage"
  | "audit:view";

const ALL: Permission[] = [
  "dashboard:view", "results:view", "results:export", "ranking:view", "ranking:decide", "evaluation:write", "results:grade", "candidates:edit", "live:view", "live:terminate",
  "exams:write", "sessions:manage", "convocatorias:manage", "users:manage", "audit:view",
];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  SUPERADMIN: new Set(ALL),
  ADMIN: new Set(ALL.filter((p) => p !== "users:manage" && p !== "audit:view")),
  REVIEWER: new Set<Permission>(["dashboard:view", "results:view", "ranking:view", "evaluation:write", "live:view"]),
};

export const ROLES: Role[] = ["SUPERADMIN", "ADMIN", "REVIEWER"];

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  SUPERADMIN: { label: "Superadmin", description: "Acceso total, incluida la gestión de administradores y roles." },
  ADMIN: {
    label: "Administrador",
    description: "Crea exámenes y convocatorias, habilita aspirantes, monitorea y consulta resultados. No gestiona usuarios.",
  },
  REVIEWER: {
    label: "Revisor",
    description: "Consulta dashboard, monitoreo, resultados y ranking, y deja su voto y comentarios en la evaluación de candidatos. No modifica nada más ni exporta datos.",
  },
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].has(permission);
}
