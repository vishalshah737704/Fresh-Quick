"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { failed: boolean };

// A map problem must never take down a page: any render or effect error inside
// the map subtree shows the fallback instead.
export default class MapErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Map failed", error);
  }

  render() {
    if (this.state.failed) {
      return (
        this.props.fallback ?? (
          <p role="status" className="text-sm text-brand-ink-muted">
            The map could not be shown right now.
          </p>
        )
      );
    }
    return this.props.children;
  }
}
