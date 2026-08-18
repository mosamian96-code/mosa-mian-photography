"use client";

import { signOut, useSession } from "next-auth/react";

export function StudioHeader() {
  const { data: session } = useSession();

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
      <span className="text-sm font-medium tracking-wide text-neutral-900">
        Mosa Mian Photography — Studio
      </span>
      {session?.user?.email ? (
        <button
          type="button"
          onClick={() => signOut({ redirectTo: "/studio/login" })}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          Sign out
        </button>
      ) : null}
    </header>
  );
}
