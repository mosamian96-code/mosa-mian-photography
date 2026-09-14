"use client";

import { useActionState } from "react";
import { signInWithPassword } from "./actions";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(signInWithPassword, null);

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">Sign in</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Enter your admin email and password.</p>
      <form action={formAction} className="mt-6 space-y-3">
        <input
          type="email"
          name="email"
          required
          autoComplete="username"
          placeholder="you@example.com"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-400"
        />
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-400"
        />
        <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
          <input type="checkbox" name="remember" className="rounded border-neutral-300 dark:border-neutral-700" />
          Remember me for 30 days
        </label>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
