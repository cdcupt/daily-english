"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { oauthApple } from "@/api/endpoints";

/**
 * Apple Sign In redirect fallback.
 *
 * The primary flow uses `usePopup: true`, so Apple returns the credential to
 * the opener's JS and this route is never hit. It exists only for the redirect
 * fallback: Apple POSTs/redirects here with `id_token` (+ optional `state` we
 * reuse as the nonce). We verify it server-side, then send the user home.
 */
function AppleCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const ran = useRef(false); // StrictMode double-invoke guard
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Apple may deliver the token via query (form_post is server-only, but the
    // hosting layer can re-expose it as a query param for this static route).
    const idToken = params.get("id_token");
    const nonce = params.get("state") ?? params.get("nonce") ?? undefined;

    if (!idToken) {
      router.replace("/");
      return;
    }

    oauthApple(idToken, nonce ?? undefined)
      .then(() => router.replace("/"))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Apple sign-in failed");
      });
  }, [params, router]);

  return (
    <main id="main" className="app-shell">
      <div className="center-state">
        {error ? (
          <>
            <p style={{ color: "var(--color-red)", marginBottom: 12 }}>{error}</p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => router.replace("/")}
            >
              Back to app
            </button>
          </>
        ) : (
          "Finishing sign-in…"
        )}
      </div>
    </main>
  );
}

export default function AppleCallbackPage() {
  return (
    <Suspense
      fallback={
        <main id="main" className="app-shell">
          <div className="center-state">Finishing sign-in…</div>
        </main>
      }
    >
      <AppleCallback />
    </Suspense>
  );
}
