import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clearFailures, isLockedOut, recordFailure } from "@/lib/rate-limit";

// Hash de relleno: se compara aunque el usuario no exista para igualar tiempos de respuesta
// y no revelar qué correos están registrados.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO8hQmY0r8x1kqkq5tq7tG8pD3m2rQeWy";

export const LOCKED_ERROR = "TOO_MANY_ATTEMPTS";

function clientIp(headers: Record<string, unknown> | undefined): string {
  const fwd = headers?.["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : typeof fwd === "string" ? fwd : "";
  return raw.split(",")[0]?.trim().slice(0, 64) || "unknown";
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8 h
  pages: { signIn: "/admin/login" },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials, req) {
        const email = credentials?.email?.trim().toLowerCase().slice(0, 254);
        const password = credentials?.password;
        if (!email || !password || password.length > 200) return null;

        const ip = clientIp(req?.headers as Record<string, unknown> | undefined);
        if (await isLockedOut(email, ip)) throw new Error(LOCKED_ERROR);

        const admin = await prisma.adminUser.findUnique({ where: { email } });
        const valid = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
        if (!admin || !valid) {
          await recordFailure(email, ip);
          return null;
        }

        await clearFailures(email);
        await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
        return { id: admin.id, email: admin.email, name: admin.name, tokenVersion: admin.tokenVersion };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.tokenVersion = user.tokenVersion ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id ?? "";
      session.user.tokenVersion = token.tokenVersion ?? 0;
      return session;
    },
  },
};
