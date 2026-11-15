"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAdmin, hasPermission, UNAUTHORIZED } from "@/lib/require-admin";
import { logAction } from "@/lib/audit";
import { ROLE_INFO } from "@/lib/permissions";

const emailOf = async (id: string) => (await prisma.adminUser.findUnique({ where: { id }, select: { email: true } }))?.email ?? "un usuario";
import { passwordIssue } from "@/lib/password";
import { ROLES, type Role } from "@/lib/permissions";
import type { ActionResult } from "@/actions/account";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AdminRow = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  mustChangePassword: boolean;
};

/** Solo SUPERADMIN. Como quien actúa siempre es un SUPERADMIN activo, nunca puede quedar el sistema sin uno
 *  mientras las acciones prohíban operar sobre uno mismo (se valida en cada acción). */
export async function listAdmins(): Promise<{ me: string; admins: AdminRow[] } | null> {
  const me = await getAdmin();
  if (!me || me.mustChangePassword || me.role !== "SUPERADMIN") return null;
  const admins = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, lastLoginAt: true, mustChangePassword: true },
  });
  return { me: me.id, admins };
}

const isRole = (r: unknown): r is Role => typeof r === "string" && (ROLES as string[]).includes(r);

/** Crea un administrador con contraseña temporal: deberá cambiarla en su primer ingreso. */
export async function createAdmin(input: { name: string; email: string; password: string; role: Role }): Promise<ActionResult> {
  if (!(await hasPermission("users:manage"))) return { ok: false, error: UNAUTHORIZED };
  const email = input.email?.trim().toLowerCase();
  const name = input.name?.trim().replace(/\s+/g, " ").slice(0, 80) || null;
  if (!email || !EMAIL_OK.test(email) || email.length > 254) return { ok: false, error: "Correo inválido." };
  if (!isRole(input.role)) return { ok: false, error: "Rol inválido." };
  const issue = passwordIssue(input.password ?? "");
  if (issue) return { ok: false, error: issue };

  try {
    if (await prisma.adminUser.findUnique({ where: { email }, select: { id: true } }))
      return { ok: false, error: "Ya existe un usuario con ese correo." };
    await prisma.adminUser.create({
      data: { email, name, role: input.role, passwordHash: await bcrypt.hash(input.password, 12), mustChangePassword: true },
    });
    await logAction({ action: "user.create", entityType: "user", summary: `Creó el usuario ${email} con rol ${ROLE_INFO[input.role].label}` });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo crear el usuario." };
  }
}

async function guardTarget(id: string): Promise<{ ok: true; meId: string } | { ok: false; error: string }> {
  if (!(await hasPermission("users:manage"))) return { ok: false, error: UNAUTHORIZED };
  const me = await getAdmin();
  if (!me) return { ok: false, error: UNAUTHORIZED };
  if (id === me.id) return { ok: false, error: "No puedes realizar esta acción sobre tu propio usuario." };
  return { ok: true, meId: me.id };
}

export async function setAdminRole(id: string, role: Role): Promise<ActionResult> {
  const g = await guardTarget(id);
  if (!g.ok) return g;
  if (!isRole(role)) return { ok: false, error: "Rol inválido." };
  try {
    await prisma.adminUser.update({ where: { id }, data: { role } });
    await logAction({ action: "user.role", entityType: "user", entityId: id, summary: `Cambió el rol de ${await emailOf(id)} a ${ROLE_INFO[role].label}` });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo cambiar el rol." };
  }
}

/** Desactiva/reactiva el acceso sin borrar al usuario. Al desactivar se cierran sus sesiones. */
export async function setAdminActive(id: string, active: boolean): Promise<ActionResult> {
  const g = await guardTarget(id);
  if (!g.ok) return g;
  try {
    await prisma.adminUser.update({
      where: { id },
      data: active ? { isActive: true } : { isActive: false, tokenVersion: { increment: 1 } },
    });
    await logAction({ action: "user.active", entityType: "user", entityId: id, summary: `${active ? "Reactivó" : "Desactivó"} el acceso de ${await emailOf(id)}` });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo actualizar el acceso." };
  }
}

/** Restablece la contraseña de OTRO usuario (queda temporal y se cierran sus sesiones). */
export async function resetAdminPassword(id: string, password: string): Promise<ActionResult> {
  const g = await guardTarget(id);
  if (!g.ok) return g;
  const issue = passwordIssue(password ?? "");
  if (issue) return { ok: false, error: issue };
  try {
    await prisma.adminUser.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true, tokenVersion: { increment: 1 } },
    });
    await logAction({ action: "user.reset_password", entityType: "user", entityId: id, summary: `Restableció la contraseña de ${await emailOf(id)}` });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo restablecer la contraseña." };
  }
}

export async function deleteAdmin(id: string): Promise<ActionResult> {
  const g = await guardTarget(id);
  if (!g.ok) return g;
  try {
    const who = await emailOf(id);
    await prisma.adminUser.delete({ where: { id } });
    await logAction({ action: "user.delete", entityType: "user", entityId: id, summary: `Eliminó al usuario ${who}` });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo eliminar el usuario." };
  }
}
