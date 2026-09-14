"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send reset email");
        setLoading(false);
        return;
      }

      setSubmitted(true);
      setLoading(false);
    } catch (err) {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-900 px-4">
        <div className="w-full max-w-md rounded bg-neutral-800 p-8">
          <h1 className="mb-2 text-2xl font-bold text-white">Check your email</h1>
          <p className="mb-6 text-neutral-300">
            We've sent a password reset link to <strong>{email}</strong>. Click the link in your email to reset your password.
          </p>
          <p className="text-sm text-neutral-400">The link expires in 1 hour. Check your spam folder if you don't see it.</p>
          <Link href="/studio/login" className="mt-6 block text-center text-blue-400 hover:text-blue-300">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-900 px-4">
      <div className="w-full max-w-md">
        <h1 className="mb-2 text-3xl font-bold text-white">Forgot password?</h1>
        <p className="mb-6 text-neutral-400">Enter your email and we'll send you a link to reset your password.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-4 py-2 text-white placeholder-neutral-500 outline-none focus:border-neutral-600"
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-white py-2 font-medium text-neutral-900 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-neutral-400">
          Remember your password?{" "}
          <Link href="/studio/login" className="text-blue-400 hover:text-blue-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
