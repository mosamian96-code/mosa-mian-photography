import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (the `middleware` export is now
// `proxy`). This runs on every request matched below -- originally /studio only (for
// the login redirect), widened to also cover CSP nonce generation (see buildCsp
// below) for every document response.

/** Per-request nonce for Content-Security-Policy's script-src. Next's App Router
 * injects inline hydration/flight-data scripts that differ on every request, so a
 * static CSP can only allow them via 'unsafe-inline' (defeats the point of CSP) or a
 * nonce. Setting the nonce on the `x-nonce` request header and the CSP response
 * header together is Next's documented convention -- when it sees both, Next
 * automatically nonces its own inline scripts, so only the two inline scripts this
 * app itself renders (ThemeScript, the Turnstile widget loader) need to read and
 * apply `x-nonce` manually (see studio/theme-script.tsx, contact-form.tsx). */
function buildCsp(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Inline `style={{...}}` is used throughout the app's components -- CSP's
    // style-src governs those the same as <style> tags, and nonce-ing every single
    // style attribute individually isn't practical here.
    "style-src 'self' 'unsafe-inline'",
    // cdn.* serves every public photo/video derivative; tile.openstreetmap.org is the
    // gallery map's tile source (src/components/gallery-map.tsx); data:/blob: cover
    // LQIP placeholders and client-generated preview URLs.
    "img-src 'self' https://cdn.mosamianphotography.com https://*.tile.openstreetmap.org data: blob:",
    "font-src 'self' data:",
    "media-src 'self' https://cdn.mosamianphotography.com",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  if (pathname.startsWith("/studio")) {
    const isAuthRoute = pathname.startsWith("/studio/login");
    if (!session) {
      if (!isAuthRoute) return NextResponse.redirect(new URL("/studio/login", req.url));
    } else if (isAuthRoute) {
      return NextResponse.redirect(new URL("/studio", req.url));
    }
  }

  const nonce = crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  return response;
});

export const config = {
  // Skip static assets and the cdn image/video proxy route -- CSP is a response
  // header for *documents*, not binary asset responses, and applying the nonce
  // machinery to every single derivative request would be pure overhead.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cdn).*)"],
};
