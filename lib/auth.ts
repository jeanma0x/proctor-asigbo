import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Hash de relleno: se compara aunque el usuario no exista para igualar tiempos de respuesta
// y no revelar qué correos están registrados.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO8hQmY0r8x1kqkq5tq7tG8pD3m2rQeWy";

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
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;

        const admin = await prisma.adminUser.findUnique({ where: { email } });
        const valid = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
        if (!admin || !valid) return null;

        return { id: admin.id, email: admin.email };
      },
    }),
  ],
};
