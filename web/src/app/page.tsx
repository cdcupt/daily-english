"use client";

import { useState } from "react";
import { AppShell, type Surface } from "@/components/AppShell";
import { StudyView } from "@/components/StudyView";
import { YouView } from "@/components/YouView";
import { SettingsView } from "@/components/SettingsView";
import { Onboarding } from "@/components/Onboarding";
import { useAuth } from "@/lib/useAuth";
import { useAccount } from "@/lib/useAccount";

export default function Home() {
  // useAuth bootstraps the anonymous device session under the hood so API calls
  // (including the OAuth link step) always have a JWT. It does NOT gate the UI.
  const { status, error, signOut } = useAuth();
  const account = useAccount();
  const [surface, setSurface] = useState<Surface>("study");

  // Wait for the session bootstrap before deciding what to render.
  if (status === "checking") {
    return (
      <main className="app-shell">
        <div className="center-state">Loading…</div>
      </main>
    );
  }

  // Login-first gate: no linked account → only the sign-in screen is reachable.
  // Flip this single conditional to change the gating policy.
  if (!account.account) {
    return (
      <Onboarding
        error={status === "error" ? error : null}
        account={account}
      />
    );
  }

  // Signed in → the full tabbed app.
  return (
    <AppShell active={surface} onNavigate={setSurface}>
      {surface === "study" && <StudyView />}
      {surface === "you" && <YouView />}
      {surface === "settings" && (
        <SettingsView onSignOut={signOut} account={account} />
      )}
    </AppShell>
  );
}
