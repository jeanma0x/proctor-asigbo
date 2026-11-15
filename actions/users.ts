"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAdmin, isAdmin, UNAUTHORIZED } from "@/lib/require-admin";
import { passwordIssue } from "@/lib/password";
import type { ActionResult } from "@/actions/account";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AdminRow = {
  id: string;
  name: string | null;
  email: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  mustChangePassword: boolean;
};

export async function listAdmins(): Promise<{ me: string; admins: AdminRow[] } | null> {
  const me = await getAdmin();
  if (!me || me.mustChangePassword) return null;
  const admins = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, createdAt: true, lastLoginAt: true, mustChangePassword: true },
  });
  return { me: me.id, admins };
}

/** Crea un administrador con contraseña temporal: deberá cambiarla en su primer ingreso. */
export async function createAdmin(input: { name: string; email: string; password: string }): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: UNAUTHORIZED };
  const email = input.email?.trim().toLowerCase();
  const name = input.name?.trim().replace(/\s+/g, " ").slice(0, 80) || null;
  if (!email || !EMAIL_OK.test(email) || email.length > 254) return { ok: false, error: "Correo inválido." };
  const issue = passwordIssue(input.password ?? "");
  if (issue) return { ok: false, error: issue };

  try {
    if (await prisma.adminUser.findUnique({ where: { email }, select: { id: true } }))
      return { ok: false, error: "Ya existe un administrador con ese correo." };
    await prisma.adminUser.create({
      data: { email, name, passwordHash: await bcrypt.hash(input.password, 12), mustChangePassword: true },
    });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo crear el administrador." };
  }
}

/** Restablece la contraseña de OTRO administrador (queda temporal y se cierran sus sesiones). */
export async function resetAdminPassword(id: string, password: string): Promise<ActionResult> {
  const me = await getAdmin();
  if (!me || me.mustChangePassword) return { ok: false, error: UNAUTHORIZED };
  if (id === me.id) return { ok: false, error: "Para cambiar tu contraseña usa «Mi cuenta»." };
  const issue = passwordIssue(password ?? "");
  if (issue) return { ok: false, error: issue };
  try {
    await prisma.adminUser.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true, tokenVersion: { increment: 1 } },
    });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo restablecer la contraseña." };
  }
}

export async function deleteAdmin(id: string): Promise<ActionResult> {
  const me = await getAdmin();
  if (!me || me.mustChangePassword) return { ok: false, error: UNAUTHORIZED };
  if (id === me.id) return { ok: false, error: "No puedes eliminar tu propio usuario." };
  try {
    if ((await prisma.adminUser.count()) <= 1) return { ok: false, error: "Debe quedar al menos un administrador." };
    await prisma.adminUser.delete({ where: { id } });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo eliminar el administrador." };
  }
}
