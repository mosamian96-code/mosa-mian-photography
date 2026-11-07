"use client";

import { useEffect } from "react";

/** Catches an error thrown by the root layout itself (error.tsx can't -- it renders
 * inside the layout, so a layout crash would take it down too). Must render its own
 * <html>/<body>: this replaces the entire document, including the layout that would
 * normally provide them. Kept deliberately plain (no shared components, no fonts) so
 * it can't itself fail to render for the same reason the layout just did. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: `[global] ${error.message}${error.digest ? ` (digest: ${error.digest})` : ""}` }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#171717" }}>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 500 }}>Something went wrong</h1>
          <p style={{ marginTop: "0.75rem", maxWidth: "26rem", fontSize: "0.9rem", color: "#737373" }}>
            It&apos;s been logged. Please reload the page.
          </p>
          <a
            href="/"
            style={{
              marginTop: "2rem",
              borderRadius: "4px",
              background: "#171717",
              color: "#fff",
              padding: "0.6rem 1rem",
              fontSize: "0.9rem",
              textDecoration: "none",
            }}
          >
            Back to the homepage
          </a>
        </main>
      </body>
    </html>
  );
}
