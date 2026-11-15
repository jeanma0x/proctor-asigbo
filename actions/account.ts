"use server";

import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

/** Reglas de contraseña nueva; devuelve el mensaje de error o null si es válida. */
function passwordIssue(pw: string): string | null {
  if (pw.length < 10) return "La nueva contraseña debe tener al menos 10 caracteres.";
  if (pw.length > 72) return "La nueva contraseña no puede superar 72 caracteres.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw))
    return "Debe incluir mayúsculas, minúsculas y números.";
  return null;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<ChangePasswordResult> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return { ok: false, error: "Sesión expirada. Inicia sesión de nuevo." };

  if (!currentPassword || !newPassword) return { ok: false, error: "Completa todos los campos." };
  if (newPassword !== confirmPassword) return { ok: false, error: "La confirmación no coincide." };
  if (newPassword === currentPassword) return { ok: false, error: "La nueva contraseña debe ser distinta a la actual." };
  const issue = passwordIssue(newPassword);
  if (issue) return { ok: false, error: issue };

  try {
    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !(await bcrypt.compare(currentPassword, admin.passwordHash)))
      return { ok: false, error: "La contraseña actual es incorrecta." };

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo actualizar la contraseña." };
  }
}
