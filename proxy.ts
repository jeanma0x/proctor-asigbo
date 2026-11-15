import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Next.js 16 renombró la convención `middleware.ts` a `proxy.ts` (misma función, nuevo nombre).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (pathname === "/admin/login") {
    // Si ya hay sesión, no tiene sentido mostrar el login.
    // `expired` = la cookie existe pero el servidor la invalidó: no redirigir (evita un bucle).
    if (token && !request.nextUrl.searchParams.has("expired")) return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    return NextResponse.next();
  }

  if (!token) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
