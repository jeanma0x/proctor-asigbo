"use server";

import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/require-admin";

export type AuditFilters = { actor?: string; category?: string; q?: string; from?: string; to?: string; cursor?: string };

export type AuditRow = { id: string; actorEmail: string; actorName: string | null; action: string; summary: string; createdAt: Date };

const PAGE = 100;
/** Fechas «YYYY-MM-DD» interpretadas en hora de Guatemala (UTC-6, sin horario de verano). */
const dayStart = (d: string) => new Date(`${d}T00:00:00-06:00`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999-06:00`);

/** Bitácora de acciones de los administradores (solo superadmin). Paginada con cursor, más reciente primero. */
export async function listAuditLog(f: AuditFilters): Promise<{ rows: AuditRow[]; next: string | null; actors: { email: string; name: string | null }[] } | null> {
  if (!(await hasPermission("audit:view"))) return null;
  const valid = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const where = {
    ...(f.actor ? { actorEmail: f.actor } : {}),
    ...(f.category ? { action: { startsWith: `${f.category}.` } } : {}),
    ...(f.q?.trim() ? { summary: { contains: f.q.trim(), mode: "insensitive" as const } } : {}),
    ...(valid(f.from) || valid(f.to) ? { createdAt: { ...(valid(f.from) ? { gte: dayStart(f.from!) } : {}), ...(valid(f.to) ? { lte: dayEnd(f.to!) } : {}) } } : {}),
  };
  const [items, actors] = await Promise.all([
    prisma.adminActionLog.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: PAGE + 1,
      ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
      select: { id: true, actorEmail: true, actorName: true, action: true, summary: true, createdAt: true },
    }),
    prisma.adminActionLog.groupBy({ by: ["actorEmail"], _max: { actorName: true } }),
  ]);
  const more = items.length > PAGE;
  const rows = more ? items.slice(0, PAGE) : items;
  return { rows, next: more ? rows[rows.length - 1].id : null, actors: actors.map((a) => ({ email: a.actorEmail, name: a._max.actorName })).sort((a, b) => a.email.localeCompare(b.email)) };
}
