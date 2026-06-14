"use client";

import { useEffect, useState } from "react";
import { authAnonymous } from "@/api/endpoints";
import { isAuthenticated, isOperator } from "@/api/tokens";
import { AdminView } from "@/components/admin/AdminView";

type Gate = "checking" | "operator" | "denied";

/**
 * Operator-gated admin route. We ensure a session exists, then read the stored
 * token's role. Non-operators get a 404-style "Not found" — the surface is never
 * revealed, matching the server's 404 policy (requireOperator). The server also
 * re-enforces this on every /v1/admin/* call, so the client gate is UX only.
 */
export default function AdminPage() {
  const [gate, setGate] = useState<Gate>("checking");

  useEffect(() => {
    let cancelled = false;
    async function resolveGate() {
      try {
        if (!isAuthenticated()) {
          await authAnonymous();
        }
      } catch {
        // fall through to role check; a denied gate is the safe default
      }
      if (cancelled) return;
      setGate(isOperator() ? "operator" : "denied");
    }
    resolveGate();
    return () => {
      cancelled = true;
    };
  }, []);

  if (gate === "checking") {
    return (
      <main className="app-shell">
        <div className="center-state">Loading…</div>
      </main>
    );
  }

  if (gate === "denied") {
    return (
      <main className="app-shell">
        <div className="op-404">
          <div>
            <div className="code">404</div>
            <p>This page could not be found.</p>
          </div>
        </div>
      </main>
    );
  }

  return <AdminView />;
}
