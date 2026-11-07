"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean };

/** Section-level crash containment -- Next's error.tsx only catches at the route
 * segment, which would blank out an entire page for one bad component (e.g. a
 * gallery item with malformed data). This stops the blast radius at whatever it
 * wraps instead, matching the brief's "never let one failed component crash the
 * whole site." React error boundaries have no hooks-based equivalent (no
 * useErrorBoundary), hence the class component. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error.message }),
    }).catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <p className="py-10 text-center text-sm text-neutral-400">This section couldn&apos;t load.</p>
        )
      );
    }
    return this.props.children;
  }
}
