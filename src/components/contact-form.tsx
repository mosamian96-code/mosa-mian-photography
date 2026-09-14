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
    return (
      <p className="text-sm text-neutral-600" style={{ animation: "reveal-up var(--dur-base) var(--ease-settle) both" }}>
        Thanks — I&apos;ll get back to you soon.
      </p>
    );
  }

  const inputClass =
    "rounded border border-neutral-300 bg-neutral-50/50 px-3.5 py-2.5 text-sm outline-none transition-all duration-200 ease-out focus:border-neutral-900 focus:bg-white focus:ring-1 focus:ring-neutral-900/20";
  const labelClass = "text-xs font-medium uppercase tracking-wide text-neutral-400";

  return (
    <>
      {turnstileSiteKey ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /> : null}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Name</span>
          <input
            type="text"
            required
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Email</span>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Message</span>
          <textarea
            required
            placeholder="What are you looking to shoot, and when?"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={`${inputClass} resize-none`}
          />
        </label>
        {turnstileSiteKey ? <div className="cf-turnstile" data-sitekey={turnstileSiteKey} /> : null}
        {status === "error" ? (
          <p className="text-sm text-red-600" style={{ animation: "reveal-up var(--dur-base) var(--ease-settle) both" }}>
            Something went wrong — try again.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={status === "sending"}
          className="relative mt-1 flex items-center justify-center gap-2 rounded bg-neutral-900 px-3 py-2.5 text-sm font-medium text-white transition-all duration-200 ease-out hover:bg-neutral-700 active:scale-[0.98] disabled:opacity-60"
        >
          {status === "sending" ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/40 border-t-white" />
          ) : null}
          {status === "sending" ? "Sending…" : "Send"}
        </button>
      </form>
    </>
  );
}
