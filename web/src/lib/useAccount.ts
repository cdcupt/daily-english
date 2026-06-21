"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAuthConfig,
  oauthGoogle,
  oauthApple,
  signOut,
} from "@/api/endpoints";
import { getStoredAccount } from "@/api/tokens";
import type { AuthConfig, AuthProvider } from "@/api/types";
import {
  loadGoogleIdentity,
  loadAppleId,
  freshNonce,
  APPLE_REDIRECT_URI,
  type GoogleCredentialResponse,
} from "@/lib/oauthScripts";

export interface AccountIdentity {
  email: string | null;
  provider: AuthProvider;
}

export interface AvailableProviders {
  google?: { clientId: string };
  apple?: { clientId: string };
}

export interface UseAccount {
  /** Only the providers whose clientId was returned by /auth/config. */
  providers: AvailableProviders;
  /** The linked account, or `null` for an anonymous session. */
  account: AccountIdentity | null;
  /** True until /auth/config has resolved once. */
  loadingConfig: boolean;
  /** A provider sign-in is currently in flight. */
  busy: AuthProvider | null;
  error: string | null;
  /** Begin the Google credential flow (loads GIS, prompts, verifies). */
  linkWithGoogle: () => Promise<void>;
  /** Begin the Apple popup flow (loads appleid.auth.js, verifies). */
  linkWithApple: () => Promise<void>;
  /** Sign out then re-establish an anonymous session. */
  signOutAccount: () => Promise<void>;
  /** Imperatively re-read the stored account (after an external change). */
  refresh: () => void;
}

/** Seed `account` synchronously from the token store so there is no flash. */
function seedAccount(): AccountIdentity | null {
  const stored = getStoredAccount();
  if (!stored.provider) return null;
  return { email: stored.email, provider: stored.provider };
}

/**
 * Account/OAuth controller. Loads /auth/config once, exposes the available
 * providers (empty when the backend is dormant), the current linked identity,
 * and link / sign-out actions. Provider buttons should render only for keys
 * present in `providers`.
 */
export function useAccount(): UseAccount {
  const [providers, setProviders] = useState<AvailableProviders>({});
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [account, setAccount] = useState<AccountIdentity | null>(seedAccount);
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guards against StrictMode double-invoke + post-unmount state writes.
  const configLoaded = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (configLoaded.current) return;
    configLoaded.current = true;
    let cancelled = false;
    getAuthConfig()
      .then((cfg: AuthConfig) => {
        if (cancelled) return;
        const next: AvailableProviders = {};
        if (cfg.google.clientId) next.google = { clientId: cfg.google.clientId };
        if (cfg.apple.clientId) next.apple = { clientId: cfg.apple.clientId };
        setProviders(next);
      })
      .catch(() => {
        // Dormant or unreachable config → no buttons, anonymous experience.
        if (!cancelled) setProviders({});
      })
      .finally(() => {
        if (!cancelled) setLoadingConfig(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(() => {
    setAccount(seedAccount());
  }, []);

  const linkWithGoogle = useCallback(async () => {
    const clientId = providers.google?.clientId;
    if (!clientId || busy) return;
    setBusy("google");
    setError(null);
    try {
      const id = await loadGoogleIdentity();
      const nonce = freshNonce();
      const credential = await new Promise<string>((resolve, reject) => {
        id.initialize({
          client_id: clientId,
          nonce,
          callback: (response: GoogleCredentialResponse) => {
            if (response.credential) resolve(response.credential);
            else reject(new Error("Google sign-in returned no credential"));
          },
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
        });
        id.prompt();
      });
      const result = await oauthGoogle(credential, nonce);
      if (mounted.current) {
        setAccount({ email: result.email, provider: "google" });
      }
    } catch (e) {
      if (mounted.current) {
        setError(
          e instanceof Error ? e.message : "Could not sign in with Google",
        );
      }
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, [providers.google, busy]);

  const linkWithApple = useCallback(async () => {
    const clientId = providers.apple?.clientId;
    if (!clientId || busy) return;
    setBusy("apple");
    setError(null);
    try {
      const auth = await loadAppleId();
      const nonce = freshNonce();
      auth.init({
        clientId,
        scope: "name email",
        redirectURI: APPLE_REDIRECT_URI,
        nonce,
        usePopup: true,
      });
      const response = await auth.signIn();
      const idToken = response.authorization.id_token;
      if (!idToken) throw new Error("Apple sign-in returned no token");
      const result = await oauthApple(idToken, nonce);
      if (mounted.current) {
        setAccount({ email: result.email, provider: "apple" });
      }
    } catch (e) {
      // Apple throws on user-cancel too; surface a soft message only on real errors.
      const message =
        e instanceof Error && e.message ? e.message : "Could not sign in with Apple";
      const cancelled = /cancel|popup_closed|user_cancelled/i.test(message);
      if (mounted.current && !cancelled) setError(message);
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, [providers.apple, busy]);

  const signOutAccount = useCallback(async () => {
    setError(null);
    try {
      await signOut();
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : "Could not sign out");
      }
    } finally {
      // signOut() always re-establishes anonymous tokens; clear the identity.
      if (mounted.current) setAccount(null);
    }
  }, []);

  return {
    providers,
    account,
    loadingConfig,
    busy,
    error,
    linkWithGoogle,
    linkWithApple,
    signOutAccount,
    refresh,
  };
}
