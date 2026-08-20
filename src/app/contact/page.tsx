import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";

// Reads TURNSTILE_SITE_KEY from the environment on every request rather than baking
// it into a statically prerendered page at build time -- without this, filling in the
// key later and restarting the container wouldn't be enough; only a rebuild would pick
// it up, since the static HTML was already generated with whatever value (or lack of
// one) existed when `npm run build` ran.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Contact — Mosa Mian Photography" };

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl text-neutral-900" style={{ fontFamily: "var(--font-display)", fontWeight: 300 }}>
        Get in touch
      </h1>
      <div className="mt-6">
        <ContactForm turnstileSiteKey={process.env.TURNSTILE_SITE_KEY ?? null} />
      </div>
    </main>
  );
}
