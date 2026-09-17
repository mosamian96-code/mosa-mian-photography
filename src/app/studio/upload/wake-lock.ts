// Screen Wake Lock API -- keeps the phone's screen from auto-locking while an
// upload is running, which is itself a common cause of an interrupted upload even
// when the visitor never deliberately switches apps. Doesn't survive a deliberate
// app-switch (the OS releases it, and re-acquiring only works while the tab is the
// active one) -- that part of "don't interrupt my upload" is a platform restriction
// no page's code can override, which is what pending-uploads-db.ts's resumability
// is actually for.
let sentinel: WakeLockSentinel | null = null;

export async function acquireWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request("screen");
  } catch {
    // Denied (e.g. low battery mode) or unsupported in this context -- uploads
    // still work, the screen just isn't held awake for them.
  }
}

export async function releaseWakeLock() {
  try {
    await sentinel?.release();
  } catch {
    // Already released (e.g. the tab was backgrounded, which auto-releases it) --
    // nothing to do.
  }
  sentinel = null;
}

/** Re-acquires the lock when the tab becomes visible again while still uploading --
 * the browser auto-releases the lock on backgrounding, and won't hand it back on
 * its own once the visitor returns to the tab. */
export function reacquireWakeLockOnVisible(isStillRunning: () => boolean) {
  const handler = () => {
    if (document.visibilityState === "visible" && isStillRunning()) acquireWakeLock();
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}
