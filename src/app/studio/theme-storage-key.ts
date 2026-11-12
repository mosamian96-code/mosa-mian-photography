/** Shared by the pre-paint ThemeScript (a Server Component) and the client-side
 * ThemeToggle. Deliberately a plain module with no "use client": a value a Server
 * Component imports from a client module arrives as a client reference, not the value
 * -- the inline script ended up calling localStorage.getItem('function() {...}'), so
 * dark mode never survived a reload. */
export const THEME_STORAGE_KEY = "studio-theme";
