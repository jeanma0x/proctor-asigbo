import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    tokenVersion?: number;
  }
  interface Session {
    user: { id: string; email: string; name?: string | null; tokenVersion: number };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    tokenVersion?: number;
  }
}
