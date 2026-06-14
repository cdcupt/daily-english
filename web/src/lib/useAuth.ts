"use client";

import { useCallback, useEffect, useState } from "react";
import { authAnonymous } from "@/api/endpoints";
import { isAuthenticated, getUserId, clearTokens } from "@/api/tokens";

type AuthStatus = "checking" | "anonymous" | "authed" | "error";

/**
 * Anonymous session gate. On mount, checks for a stored token; the actual
 * sign-in is user-triggered from onboarding (so the first paint can show the
 * welcome). `start()` calls POST /v1/auth/anonymous and stores tokens.
 */
export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated()) {
      setUserId(getUserId());
      setStatus("authed");
    } else {
      setStatus("anonymous");
    }
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
