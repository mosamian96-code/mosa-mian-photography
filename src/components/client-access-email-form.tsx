"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClientAccessEmailForm({ token, galleryTitle }: { token: string; galleryTitle: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/public/client-access-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email }),
    });
    setSubmitting(false);
    router.refresh();
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-lg text-neutral-900" style={{ fontFamily: "var(--font-display)" }}>
        {galleryTitle}
      </h1>
      <p className="mt-2 text-sm text-neutral-500">Enter your email to view this gallery.</p>
      <form onSubmit={handleSubmit} className="mt-6 flex w-full max-w-xs flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoFocus
          required
          className="rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
