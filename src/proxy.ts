import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (the `middleware` export is now
// `proxy`). This runs on every /studio request and only ever reads the JWT session
// cookie — no database call here, so it stays edge-safe.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isAuthRoute = pathname.startsWith("/studio/login");
  const isMfaRoute = pathname === "/studio/setup-mfa" || pathname === "/studio/verify";

  if (!session) {
    if (isAuthRoute) return;
    return NextResponse.redirect(new URL("/studio/login", req.url));
  }

  if (!session.mfaEnrolled) {
    if (pathname === "/studio/setup-mfa") return;
    return NextResponse.redirect(new URL("/studio/setup-mfa", req.url));
  }

  if (!session.mfaVerified) {
    if (pathname === "/studio/verify") return;
    return NextResponse.redirect(new URL("/studio/verify", req.url));
  }

  if (isAuthRoute || isMfaRoute) {
    return NextResponse.redirect(new URL("/studio", req.url));
  }
});

export const config = {
  matcher: ["/studio", "/studio/:path*"],
};
