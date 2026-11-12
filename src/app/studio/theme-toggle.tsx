"use client";

import { THEME_STORAGE_KEY } from "./theme-storage-key";

/** The current theme lives on <html class="dark">, set before paint by ThemeScript, so
 * this keeps no state of its own: CSS shows the matching icon, and the choice is saved
 * only when the button is actually clicked -- never on mount, where a wrong initial
 * read would overwrite the saved preference. */
export function ThemeToggle() {
  function toggle() {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
    } catch {
      // Storage blocked (private mode, strict settings): the switch still applies for this page view.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="flex h-7 w-7 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      <svg className="hidden dark:block" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
      </svg>
      <svg className="block dark:hidden" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.7 14.9A8.5 8.5 0 1 1 9.1 3.3a7 7 0 0 0 11.6 11.6Z" />
      </svg>
    </button>
  );
}
