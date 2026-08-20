"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function StudioHeader() {
  const { data: session } = useSession();

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
      <div className="flex items-center gap-6">
        <span className="text-sm font-medium tracking-wide text-neutral-900">
          Mosa Mian Photography — Studio
        </span>
        {session?.user?.email ? (
          <nav className="flex items-center gap-4 text-sm text-neutral-500">
            <Link href="/studio" className="hover:text-neutral-900">
              Home
            </Link>
            <Link href="/studio/library" className="hover:text-neutral-900">
              Library
            </Link>
            <Link href="/studio/upload" className="hover:text-neutral-900">
              Upload
            </Link>
            <Link href="/studio/folders" className="hover:text-neutral-900">
              Folders
            </Link>
            <Link href="/studio/watermarks" className="hover:text-neutral-900">
              Watermarks
            </Link>
            <Link href="/studio/site-settings" className="hover:text-neutral-900">
              Site settings
            </Link>
          </nav>
        ) : null}
      </div>
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
