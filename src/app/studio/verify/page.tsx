"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "next-auth/react";

export default function VerifyMfaPage() {
  const router = useRouter();
  const { update } = useSession();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("That code didn't match.");
      return;
    }
    await update({ mfaVerified: true });
    router.push("/studio");
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-lg font-medium text-neutral-900">Enter your 6-digit code</h1>
      <p className="mt-1 text-sm text-neutral-500">From your authenticator app.</p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          Verify
        </button>
      </form>
    </div>
  );
}
