import { prisma } from "@/lib/prisma";

/** Ventana y umbrales del bloqueo por intentos fallidos de login. */
const WINDOW_MS = 15 * 60_000;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;

const since = () => new Date(Date.now() - WINDOW_MS);

/** true si el correo o la IP superaron el límite de intentos fallidos en la ventana. */
export async function isLockedOut(email: string, ip: string): Promise<boolean> {
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { email, createdAt: { gte: since() } } }),
    prisma.loginAttempt.count({ where: { ip, createdAt: { gte: since() } } }),
  ]);
  return byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP;
}

export async function recordFailure(email: string, ip: string) {
  await prisma.loginAttempt.create({ data: { email, ip } });
  // Limpieza oportunista de registros viejos para que la tabla no crezca.
  await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
}

export async function clearFailures(email: string) {
  await prisma.loginAttempt.deleteMany({ where: { email } });
}
