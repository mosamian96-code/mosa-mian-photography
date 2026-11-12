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
    // LQIP placeholders and client-generated preview URLs. B2_ENDPOINT covers the
    // studio library grid (api/library/route.ts), which thumbnails via a presigned B2
    // URL directly rather than the public cdn proxy -- same gap as connect-src/
    // media-src below, just for <img> instead of XHR/<video>.
    `img-src 'self' https://cdn.mosamianphotography.com https://*.tile.openstreetmap.org data: blob: ${process.env.B2_ENDPOINT ?? ""}`,
    "font-src 'self' data:",
    // Video playback (lightbox.tsx) uses a presigned B2 URL straight from
    // presignGetUrl, the same class of gap as connect-src below -- the <video> tag
    // itself was never blocked, only every attempt to actually play one.
    `media-src 'self' https://cdn.mosamianphotography.com ${process.env.B2_ENDPOINT ?? ""}`,
    // Uploads PUT directly from the browser to a presigned B2 URL (upload-lib.ts's
    // xhrPut), bypassing this app entirely for the actual bytes -- connect-src governs
    // fetch/XHR targets same as any other request, so without B2's own endpoint here
    // every upload failed outright with a CSP-blocked "network error during upload",
    // indistinguishable from a real network failure until checked against this file.
    `connect-src 'self' https://challenges.cloudflare.com ${process.env.B2_ENDPOINT ?? ""}`,
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    // Violations are reported to /api/csp-report and land in the studio error log, so
    // a request this policy blocks shows up within minutes instead of surfacing as a
    // vague client error (as the B2 upload block above did). report-to is the current
    // mechanism (Chrome); report-uri covers Firefox and Safari.
    "report-uri /api/csp-report",
    "report-to csp",
  ].join("; ");
}

// The Reporting API wants an absolute HTTPS endpoint; behind Caddy the app itself sees
// plain HTTP, so the public origin comes from AUTH_URL rather than the request.
const REPORTING_ENDPOINTS = process.env.AUTH_URL ? `csp="${process.env.AUTH_URL}/api/csp-report"` : null;

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
  if (REPORTING_ENDPOINTS) response.headers.set("Reporting-Endpoints", REPORTING_ENDPOINTS);
  return response;
});

export const config = {
  // Skip static assets and the cdn image/video proxy route -- CSP is a response
  // header for *documents*, not binary asset responses, and applying the nonce
  // machinery to every single derivative request would be pure overhead.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cdn).*)"],
};
