"use client";

import { AuthButtons } from "@/components/AuthButtons";
import type { UseAccount } from "@/lib/useAccount";

interface OnboardingProps {
  /** Bootstrap error from the anonymous session, surfaced under the hero. */
  error: string | null;
  account: UseAccount;
}

/**
 * Login-first sign-in gate. The app requires a linked account, so this screen is
 * the only thing an unauthenticated visitor sees: the Cleo hero plus the social
 * sign-in buttons as the primary CTA. There is no anonymous "start" path. When
 * /auth/config returns no providers we show a clear unavailable message rather
 * than a dead-end screen, so sign-in can never hard-brick the app.
 */
export function Onboarding({ error, account }: OnboardingProps) {
  const { loadingConfig } = account;
  const hasProviders =
    !!account.providers.google || !!account.providers.apple;

  return (
    <main id="main" className="app-shell">
      <section className="onb" aria-labelledby="onb-title">
        <div className="mascot" role="img" aria-label="Cleo, your coach mascot" />
        <h1 id="onb-title">Practice English in real scenarios.</h1>
        <p>
          Order coffee, negotiate a deadline, check into a hotel — answer in
          English and get warm, three-tier coaching from Cleo. Sign in to start.
        </p>

        {loadingConfig ? (
          <p style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 18 }}>
            Loading sign-in…
          </p>
        ) : hasProviders ? (
          <AuthButtons account={account} />
        ) : (
          <p
            className="auth-error"
            role="alert"
            style={{ marginTop: 18, fontSize: 13 }}
          >
            Sign-in is temporarily unavailable — please try again later.
          </p>
        )}

        {error && (
          <p style={{ color: "var(--color-red)", fontSize: 13, marginTop: 12 }}>
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
