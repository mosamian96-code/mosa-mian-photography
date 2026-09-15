"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { ThemeToggle } from "./theme-toggle";

export function StudioHeader() {
  const { data: session } = useSession();

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
      <div className="flex items-center gap-6">
        <span className="text-sm font-medium tracking-wide text-neutral-900 dark:text-neutral-100">
          Mosa Mian Photography — Studio
        </span>
        {session?.user?.email ? (
          <nav className="flex items-center gap-4 text-sm text-neutral-500 dark:text-neutral-400">
            <Link href="/studio" className="hover:text-neutral-900 dark:hover:text-neutral-100">
              Home
            </Link>
            <Link href="/studio/upload" className="hover:text-neutral-900 dark:hover:text-neutral-100">
              Upload
            </Link>
            <Link href="/studio/folders" className="hover:text-neutral-900 dark:hover:text-neutral-100">
              Folders
            </Link>
            <Link href="/studio/watermarks" className="hover:text-neutral-900 dark:hover:text-neutral-100">
              Watermarks
            </Link>
            <Link href="/studio/site-settings" className="hover:text-neutral-900 dark:hover:text-neutral-100">
              Site settings
            </Link>
            <Link href="/studio/error-log" className="hover:text-neutral-900 dark:hover:text-neutral-100">
              Error log
            </Link>
          </nav>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        {session?.user?.email ? (
          <button
            type="button"
            onClick={() => signOut({ redirectTo: "/studio/login" })}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Sign out
          </button>
        ) : null}
      </div>
    </header>
  );
}
