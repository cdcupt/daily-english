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
  /**
   * Mount Google's official rendered sign-in button into `container`. Loads GIS,
   * calls `initialize` once, then `renderButton` — the rendered button reliably
   * opens the account chooser on click (unlike `prompt()` / One Tap, which
   * silently no-ops in many browsers). The GIS callback verifies the credential.
   */
  renderGoogleButton: (container: HTMLElement) => Promise<void>;
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

  // One nonce per mount, shared by GIS initialize() and the oauthGoogle exchange
  // so the backend's nonce check matches. google.accounts.id.initialize() is a
  // global, idempotent singleton — guard it so we call it at most once.
  const googleNonce = useRef<string>(freshNonce());
  const googleInitialized = useRef(false);

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

  /** GIS callback: verify the returned ID token, then flip to a linked session. */
  const handleGoogleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      if (!response.credential) {
        if (mounted.current) {
          setError("Google sign-in returned no credential");
        }
        return;
      }
      setBusy("google");
      setError(null);
      try {
        const result = await oauthGoogle(response.credential, googleNonce.current);
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
    },
    [],
  );

  const renderGoogleButton = useCallback(
    async (container: HTMLElement) => {
      const clientId = providers.google?.clientId;
      if (!clientId) return;
      try {
        const id = await loadGoogleIdentity();
        if (!googleInitialized.current) {
          id.initialize({
            client_id: clientId,
            nonce: googleNonce.current,
            callback: (response: GoogleCredentialResponse) => {
              void handleGoogleCredential(response);
            },
            cancel_on_tap_outside: true,
            use_fedcm_for_prompt: true,
          });
          googleInitialized.current = true;
        }
        container.replaceChildren();
        id.renderButton(container, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "left",
          width: 320,
        });
      } catch (e) {
        if (mounted.current) {
          setError(
            e instanceof Error ? e.message : "Could not load Google sign-in",
          );
        }
      }
    },
    [providers.google, handleGoogleCredential],
  );

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
    renderGoogleButton,
    linkWithApple,
    signOutAccount,
    refresh,
  };
}
