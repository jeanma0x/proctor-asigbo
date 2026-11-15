import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, type Permission, type Role } from "@/lib/permissions";

export const UNAUTHORIZED = "No autorizado. Inicia sesión de nuevo.";

export type AdminInfo = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  mustChangePassword: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
};

/**
 * Administrador de la sesión actual, validado contra la BD en cada petición:
 * si la contraseña cambió o se cerraron las sesiones (tokenVersion), el JWT viejo deja de valer.
 */
export const getAdmin = cache(async (): Promise<AdminInfo | null> => {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return null;
  const admin = await prisma.adminUser.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, isActive: true, tokenVersion: true, mustChangePassword: true, createdAt: true, lastLoginAt: true },
  });
  if (!admin || !admin.isActive || admin.tokenVersion !== session.user.tokenVersion) return null;
  const { tokenVersion, isActive, ...rest } = admin;
  void tokenVersion;
  void isActive;
  return rest;
});

/** true si hay sesión válida, sin cambio de contraseña pendiente y con el permiso indicado. */
export async function hasPermission(permission: Permission): Promise<boolean> {
  const admin = await getAdmin();
  return !!admin && !admin.mustChangePassword && can(admin.role, permission);
}
