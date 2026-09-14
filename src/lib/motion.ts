"use client";

import { useSyncExternalStore } from "react";

function subscribeToMedia(query: string, callback: () => void) {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (callback) => subscribeToMedia(query, callback),
    () => window.matchMedia(query).matches,
    () => false, // server snapshot -- effects are treated as inactive until hydrated
  );
}

/** Backs every JS-driven effect (cursor ring, magnetic button) that has no CSS
 * transition for the global prefers-reduced-motion rule in globals.css to neutralize
 * -- those set inline transforms directly on pointer move, so the effect itself has
 * to check this and refuse to run rather than relying on CSS alone. */
export function usePrefersReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/** Touch/stylus-primary devices report a coarse pointer -- used to skip the cursor
 * ring and magnetic pull entirely rather than have them misfire on tap. */
export function useIsCoarsePointer() {
  return useMediaQuery("(pointer: coarse)");
}
