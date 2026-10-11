"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { ThemeToggle } from "./theme-toggle";

const NAV_LINKS = [
  { href: "/studio", label: "Home" },
  { href: "/studio/upload", label: "Upload" },
  { href: "/studio/folders", label: "Folders" },
  { href: "/studio/watermarks", label: "Watermarks" },
  { href: "/studio/site-settings", label: "Site settings" },
  { href: "/studio/error-log", label: "Error log" },
];

/** Plain "everything in one flex row" used to just overflow outright on a phone --
 * six nav links plus the site title plus theme toggle plus sign-out had nowhere to
 * go below ~700px and either wrapped into a crushed mess or forced horizontal
 * scroll. Below `lg` this collapses to a <details>/<summary> dropdown menu (no
 * client JS needed to open/close it -- same pattern the public site's own mobile
 * menu already uses), and the title shortens so it doesn't dominate a narrow
 * header on its own. */
export function StudioHeader() {
  const { data: session } = useSession();

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 sm:px-6 sm:py-4 dark:border-neutral-800">
      <div className="flex min-w-0 items-center gap-6">
        <Link
          href="/studio"
          className="shrink-0 text-sm font-medium tracking-wide text-neutral-900 dark:text-neutral-100"
        >
          <span className="hidden sm:inline">Mosa Mian Photography — Studio</span>
          <span className="sm:hidden">MM Studio</span>
        </Link>
        {session?.user?.email ? (
          <nav className="hidden items-center gap-4 text-sm text-neutral-500 lg:flex dark:text-neutral-400">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-neutral-900 dark:hover:text-neutral-100">
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
      <div className="flex items-center gap-1 sm:gap-3">
        <ThemeToggle />
        {session?.user?.email ? (
          <>
            <button
              type="button"
              onClick={() => signOut({ redirectTo: "/studio/login" })}
              className="hidden text-sm text-neutral-500 hover:text-neutral-900 lg:inline dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              Sign out
            </button>
            <details className="relative lg:hidden">
              <summary
                aria-label="Menu"
                className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded text-neutral-600 hover:bg-neutral-100 [&::-webkit-details-marker]:hidden dark:text-neutral-400 dark:hover:bg-neutral-900"
              >
                <MenuIcon />
              </summary>
              <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />
                <button
                  type="button"
                  onClick={() => signOut({ redirectTo: "/studio/login" })}
                  className="block w-full px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
                >
                  Sign out
                </button>
              </div>
            </details>
          </>
        ) : null}
      </div>
    </header>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}
