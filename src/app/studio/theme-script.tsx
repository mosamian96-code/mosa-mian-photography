import { headers } from "next/headers";
import { THEME_STORAGE_KEY } from "./theme-storage-key";

/** Inline, blocking, runs before first paint (rendered directly in layout.tsx, not as
 * a hydrated component) -- sets the .dark class from localStorage immediately so
 * there's no flash of the wrong theme while React hydrates. A plain Server Component
 * (not "use client", unlike theme-toggle.tsx) so it can read the per-request CSP
 * nonce the proxy sets via next/headers -- without the nonce, script-src blocks it. */
export async function ThemeScript() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const code = `(function(){try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: code }} />;
}
