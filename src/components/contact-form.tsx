"use client";

import Script from "next/script";
import { useState } from "react";

export function ContactForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");

    // Turnstile's widget script injects this hidden input into the form itself once
    // the challenge completes — read it at submit time rather than wiring a global
    // JS callback for a one-field response.
    const turnstileToken = (
      e.currentTarget.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null
    )?.value;

    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message, turnstileToken }),
    });
    setStatus(res.ok ? "sent" : "error");
    if (res.ok) {
      setName("");
      setEmail("");
      setMessage("");
    }
  }

  if (status === "sent") {
    return <p className="text-sm text-neutral-600">Thanks — I&apos;ll get back to you soon.</p>;
  }

  return (
    <>
      {turnstileSiteKey ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /> : null}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          required
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <textarea
          required
          placeholder="Message"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        {turnstileSiteKey ? <div className="cf-turnstile" data-sitekey={turnstileSiteKey} /> : null}
        {status === "error" ? <p className="text-sm text-red-600">Something went wrong — try again.</p> : null}
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </>
  );
}
