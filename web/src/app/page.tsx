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
  const { status, error, start, signOut } = useAuth();
  const account = useAccount();
  const [surface, setSurface] = useState<Surface>("study");

  if (status === "checking") {
    return (
      <main className="app-shell">
        <div className="center-state">Loading…</div>
      </main>
    );
  }

  if (status === "anonymous" || status === "error") {
    return (
      <Onboarding
        onStart={start}
        loading={false}
        error={status === "error" ? error : null}
        account={account}
      />
    );
  }

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
