import { StudioHeader } from "./studio-header";
import { StudioProviders } from "./providers";
import { StudioSidebar } from "./studio-sidebar";
import { ThemeScript } from "./theme-toggle";

export const metadata = {
  title: "Studio — Mosa Mian Photography",
  robots: { index: false, follow: false },
};

// Everything under /studio is authenticated and reads live state (session, health
// checks). Never let Next prerender it at build time — with no DB/Redis reachable
// during `next build`, that hangs retrying a connection and fails the build.
export const dynamic = "force-dynamic";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudioProviders>
      <ThemeScript />
      <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <StudioHeader />
        <div className="flex">
          <StudioSidebar />
          <main className="mx-auto w-full max-w-4xl px-6 py-10">{children}</main>
        </div>
      </div>
    </StudioProviders>
  );
}
