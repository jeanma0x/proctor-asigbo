"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getAdmin } from "@/lib/require-admin";
import { passwordIssue } from "@/lib/password";

export type ActionResult = { ok: true } | { ok: false; error: string };

const SESSION_EXPIRED = "Sesión expirada. Inicia sesión de nuevo.";

/**
 * Cambia la contraseña del administrador actual. Incrementa tokenVersion, lo que invalida TODAS
 * las sesiones abiertas (incluida esta): el cliente debe cerrar sesión y volver a ingresar.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<ActionResult> {
  const admin = await getAdmin(); // permite mustChangePassword: es justo el caso de uso
  if (!admin) return { ok: false, error: SESSION_EXPIRED };

  if (!currentPassword || !newPassword) return { ok: false, error: "Completa todos los campos." };
  if (newPassword !== confirmPassword) return { ok: false, error: "La confirmación no coincide." };
  if (newPassword === currentPassword) return { ok: false, error: "La nueva contraseña debe ser distinta a la actual." };
  const issue = passwordIssue(newPassword);
  if (issue) return { ok: false, error: issue };

  try {
    const row = await prisma.adminUser.findUnique({ where: { id: admin.id }, select: { passwordHash: true } });
    if (!row || !(await bcrypt.compare(currentPassword, row.passwordHash)))
      return { ok: false, error: "La contraseña actual es incorrecta." };

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 12),
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    });
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo actualizar la contraseña." };
  }
}

export async function updateProfileName(name: string): Promise<ActionResult> {
  const admin = await getAdmin();
  if (!admin || admin.mustChangePassword) return { ok: false, error: SESSION_EXPIRED };
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 80);
  await prisma.adminUser.update({ where: { id: admin.id }, data: { name: clean || null } });
  return { ok: true };
}

/** Invalida todas las sesiones abiertas de este usuario (otros dispositivos y esta). */
export async function signOutEverywhere(): Promise<ActionResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: SESSION_EXPIRED };
  await prisma.adminUser.update({ where: { id: admin.id }, data: { tokenVersion: { increment: 1 } } });
  return { ok: true };
}
