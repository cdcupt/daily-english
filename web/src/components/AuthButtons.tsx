"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import type { UseAccount } from "@/lib/useAccount";

interface AuthButtonsProps {
  account: UseAccount;
  /** "or sign in to sync" copy above the buttons (onboarding) vs. none. */
  withDivider?: boolean;
  dividerLabel?: string;
}

const GIS_SRC = "https://accounts.google.com/gsi/client";
const APPLE_SRC =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

/** Apple logo. */
function AppleMark() {
  return (
    <span className="oauth-ic" aria-hidden>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
        <path d="M11.18 8.49c-.02-1.7 1.39-2.51 1.45-2.55-.79-1.16-2.02-1.32-2.46-1.34-1.05-.11-2.04.61-2.57.61-.53 0-1.35-.6-2.22-.58-1.14.02-2.2.66-2.78 1.68-1.19 2.06-.3 5.1.85 6.77.56.82 1.23 1.74 2.11 1.71.85-.03 1.17-.55 2.2-.55s1.31.55 2.21.53c.91-.02 1.49-.84 2.05-1.66.65-.95.91-1.87.93-1.92-.02-.01-1.78-.68-1.8-2.7zM9.5 3.6c.47-.57.79-1.36.7-2.15-.68.03-1.5.45-1.98 1.02-.43.5-.81 1.31-.71 2.08.76.06 1.53-.39 1.99-.95z" />
      </svg>
    </span>
  );
}

/**
 * Renders the available social sign-in buttons. A provider's button is shown
 * only when its clientId came back from /auth/config — so a dormant backend
 * renders nothing and the anonymous experience is untouched. The GIS / Apple
 * SDK scripts are loaded (via next/script) only when their provider is enabled.
 */
export function AuthButtons({
  account,
  withDivider = false,
  dividerLabel = "or sign in to sync",
}: AuthButtonsProps) {
  const { providers, busy, error, renderGoogleButton, linkWithApple } = account;
  const hasGoogle = !!providers.google;
  const hasApple = !!providers.apple;
  const googleSlot = useRef<HTMLDivElement | null>(null);

  // Mount Google's official rendered button into the slot once GIS is ready.
  // renderGoogleButton loads the SDK, initializes once, and renders the button
  // that reliably opens the account chooser on click.
  useEffect(() => {
    if (!hasGoogle) return;
    const slot = googleSlot.current;
    if (!slot) return;
    void renderGoogleButton(slot);
  }, [hasGoogle, renderGoogleButton]);

  if (!hasGoogle && !hasApple) return null;

  return (
    <>
      {hasGoogle && <Script src={GIS_SRC} strategy="lazyOnload" />}
      {hasApple && <Script src={APPLE_SRC} strategy="lazyOnload" />}

      {withDivider && (
        <div className="auth-divider" aria-hidden>
          {dividerLabel}
        </div>
      )}

      <div className="auth-block">
        {hasGoogle && (
          <div
            ref={googleSlot}
            className="google-btn-slot"
            data-busy={busy === "google" ? "true" : undefined}
            aria-label="Sign in with Google"
          />
        )}
        {hasApple && (
          <button
            type="button"
            className="btn-oauth btn-apple"
            onClick={linkWithApple}
            disabled={busy !== null}
            aria-label="Sign in with Apple"
          >
            <AppleMark />
            {busy === "apple" ? "Signing in…" : "Continue with Apple"}
          </button>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
