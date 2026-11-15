import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const UNAUTHORIZED = "No autorizado. Inicia sesión de nuevo.";

export type AdminInfo = {
  id: string;
  email: string;
  name: string | null;
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
    select: { id: true, email: true, name: true, tokenVersion: true, mustChangePassword: true, createdAt: true, lastLoginAt: true },
  });
  if (!admin || admin.tokenVersion !== session.user.tokenVersion) return null;
  const { tokenVersion, ...rest } = admin;
  void tokenVersion;
  return rest;
});

/** true si hay una sesión de administrador válida y sin cambio de contraseña pendiente. */
export async function isAdmin(): Promise<boolean> {
  const admin = await getAdmin();
  return !!admin && !admin.mustChangePassword;
}
