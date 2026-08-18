import { StudioHeader } from "./studio-header";
import { StudioProviders } from "./providers";

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
      <div className="min-h-screen bg-neutral-50 text-neutral-900">
        <StudioHeader />
        <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
      </div>
    </StudioProviders>
  );
}
