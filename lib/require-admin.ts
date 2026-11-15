import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** true si hay una sesión de administrador válida. */
export async function isAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  return !!session?.user;
}

export const UNAUTHORIZED = "No autorizado. Inicia sesión de nuevo.";
