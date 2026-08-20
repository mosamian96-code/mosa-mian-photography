import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";

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
