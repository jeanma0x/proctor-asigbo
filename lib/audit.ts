import { prisma } from "@/lib/prisma";
import { getAdmin } from "@/lib/require-admin";

type Entry = { action: string; entityType: string; entityId?: string | null; summary: string };

/**
 * Registra una acción del administrador en la bitácora. Nunca lanza: un fallo al auditar no debe romper la acción
 * que se está auditando (el error queda en el log del servidor).
 */
export async function logAction(e: Entry, actor?: { id: string | null; email: string; name?: string | null }) {
  try {
    const admin = actor ?? (await getAdmin());
    await prisma.adminActionLog.create({
      data: {
        actorId: admin?.id ?? null,
        actorEmail: admin?.email ?? "sistema",
        actorName: admin?.name ?? null,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId ?? null,
        summary: e.summary.slice(0, 500),
      },
    });
  } catch (err) {
    console.error("audit", err);
  }
}

/** Nombre legible de la acción (por su categoría), para filtros y etiquetas. */
export const AUDIT_CATEGORIES: Record<string, string> = {
  decision: "Decisiones",
  grade: "Calificaciones",
  exam: "Exámenes",
  session: "Accesos y sesiones",
  convocatoria: "Convocatorias",
  candidate: "Candidatos",
  user: "Usuarios y roles",
  account: "Cuenta",
  export: "Exportaciones",
  auth: "Inicios de sesión",
};
