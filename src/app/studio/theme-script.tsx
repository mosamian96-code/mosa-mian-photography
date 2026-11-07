import { headers } from "next/headers";
import { STORAGE_KEY } from "./theme-toggle";

/** Inline, blocking, runs before first paint (rendered directly in layout.tsx, not as
 * a hydrated component) -- sets the .dark class from localStorage immediately so
 * there's no flash of the wrong theme while React hydrates. A plain Server Component
 * (not "use client", unlike theme-toggle.tsx) so it can read the per-request CSP
 * nonce middleware.ts sets via next/headers -- without the nonce, this inline script
 * is blocked by script-src. */
export async function ThemeScript() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const code = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: code }} />;
}
