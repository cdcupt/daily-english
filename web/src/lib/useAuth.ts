"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authAnonymous } from "@/api/endpoints";
import { isAuthenticated, getUserId, clearTokens } from "@/api/tokens";

type AuthStatus = "checking" | "anonymous" | "authed" | "error";

/**
 * Anonymous session bootstrap. On mount it ensures a device session exists —
 * resuming a stored token or silently calling POST /v1/auth/anonymous — so that
 * authenticated API calls (including the OAuth link step) always have a session.
 * The UI is login-gated separately by `useAccount`; this only guarantees the
 * under-the-hood JWT, it does NOT decide what the user sees.
 */
export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guards against StrictMode double-invoke.
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    if (isAuthenticated()) {
      setUserId(getUserId());
      setStatus("authed");
      return;
    }

    let cancelled = false;
    authAnonymous()
      .then((auth) => {
        if (cancelled) return;
        setUserId(auth.userId);
        setStatus("authed");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not start session");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = useCallback(async () => {
    setStatus("checking");
    setError(null);
    try {
      const auth = await authAnonymous();
      setUserId(auth.userId);
      setStatus("authed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start session");
      setStatus("error");
    }
  }, []);

  const signOut = useCallback(() => {
    clearTokens();
    setUserId(null);
    setStatus("anonymous");
  }, []);

  return { status, userId, error, start, signOut };
}
