"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hasPermission, UNAUTHORIZED } from "@/lib/require-admin";
import { logAction } from "@/lib/audit";

export type ConvocatoriaRow = {
  id: string;
  name: string;
  year: number;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  exams: number;
  enabled: number;
  submitted: number;
  terminated: number;
  avgScore: number | null;
};

type Result = { ok: true } | { ok: false; error: string };

/** Convocatorias con sus métricas agregadas (más recientes primero). */
export async function listConvocatorias(): Promise<ConvocatoriaRow[]> {
  if (!(await hasPermission("dashboard:view"))) return [];
  const [convs, groups] = await Promise.all([
    prisma.convocatoria.findMany({ orderBy: [{ year: "desc" }, { createdAt: "desc" }], include: { exams: { select: { id: true } } } }),
    prisma.candidateSession.groupBy({ by: ["examId", "status"], _count: { _all: true }, _avg: { score: true } }),
  ]);
  return convs.map((c) => {
    const ids = new Set(c.exams.map((e) => e.id));
    let enabled = 0, submitted = 0, terminated = 0, scoreSum = 0, scoreN = 0;
    for (const g of groups) {
      if (!ids.has(g.examId)) continue;
      enabled += g._count._all;
      if (g.status === "SUBMITTED") {
        submitted += g._count._all;
        if (g._avg.score != null) { scoreSum += g._avg.score * g._count._all; scoreN += g._count._all; }
      }
      if (g.status === "TERMINATED") terminated += g._count._all;
    }
    return {
      id: c.id, name: c.name, year: c.year, description: c.description, status: c.status,
      exams: c.exams.length, enabled, submitted, terminated, avgScore: scoreN ? scoreSum / scoreN : null,
    };
  });
}

export async function createConvocatoria(input: { name: string; year: number; description?: string }): Promise<Result> {
  if (!(await hasPermission("convocatorias:manage"))) return { ok: false, error: UNAUTHORIZED };
  const name = input.name?.trim().replace(/\s+/g, " ").slice(0, 120);
  const year = Math.floor(Number(input.year));
  if (!name) return { ok: false, error: "El nombre es obligatorio." };
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return { ok: false, error: "El año no es válido." };
  try {
    const dup = await prisma.convocatoria.findFirst({ where: { year, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (dup) return { ok: false, error: `Ya existe una convocatoria «${name}» para ${year}.` };
    await prisma.convocatoria.create({ data: { name, year, description: input.description?.trim().slice(0, 500) || null } });
    await logAction({ action: "convocatoria.create", entityType: "convocatoria", summary: `Creó la convocatoria «${name}» (${year})` });
    revalidatePath("/admin/convocatorias");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo crear la convocatoria." };
  }
}

/** Archivar conserva todos los datos; solo la oculta del selector al crear exámenes. */
export async function setConvocatoriaStatus(id: string, status: "ACTIVE" | "ARCHIVED"): Promise<Result> {
  if (!(await hasPermission("convocatorias:manage"))) return { ok: false, error: UNAUTHORIZED };
  try {
    if (status === "ARCHIVED") {
      const live = await prisma.exam.count({ where: { convocatoriaId: id, status: "PUBLISHED" } });
      if (live > 0) return { ok: false, error: `Tiene ${live} examen(es) publicado(s). Ciérralos antes de archivar la convocatoria.` };
    }
    const c = await prisma.convocatoria.update({ where: { id }, data: { status }, select: { name: true } });
    await logAction({ action: "convocatoria.status", entityType: "convocatoria", entityId: id, summary: `${status === "ARCHIVED" ? "Archivó" : "Reactivó"} la convocatoria «${c.name}»` });
    revalidatePath("/admin/convocatorias");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo actualizar la convocatoria." };
  }
}
