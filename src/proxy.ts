import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (the `middleware` export is now
// `proxy`). This runs on every /studio request and only ever reads the JWT session
// cookie — no database call here, so it stays edge-safe.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isAuthRoute = pathname.startsWith("/studio/login");

  if (!session) {
    if (isAuthRoute) return;
    return NextResponse.redirect(new URL("/studio/login", req.url));
  }

  if (isAuthRoute) {
    return NextResponse.redirect(new URL("/studio", req.url));
  }
});

export const config = {
  matcher: ["/studio", "/studio/:path*"],
};
