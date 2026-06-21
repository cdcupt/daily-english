"use client";

import { useState } from "react";
import { CEFR_DISCLAIMER } from "@/lib/constants";
import { getUserId } from "@/api/tokens";
import { AuthButtons } from "@/components/AuthButtons";
import type { UseAccount } from "@/lib/useAccount";

type Appearance = "system" | "light" | "dark";

interface SettingsViewProps {
  onSignOut: () => void;
  account: UseAccount;
}

/**
 * Settings surface. The Account block flips between an anonymous prompt (with
 * social sign-in buttons, when /auth/config enabled a provider) and a linked
 * card showing the email + provider + a Sign out action. Voice / native-language
 * / appearance toggles are client-local. About carries the CEFR disclaimer.
 */
export function SettingsView({ onSignOut, account }: SettingsViewProps) {
  const [voice, setVoice] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [appearance, setAppearance] = useState<Appearance>("system");
  const [signingOut, setSigningOut] = useState(false);
  const userId = getUserId();

  const linked = account.account;
  const hasProviders =
    !!account.providers.google || !!account.providers.apple;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await account.signOutAccount();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="app-pad">
      <h1 className="serif" style={{ fontSize: 26, margin: "8px 0 14px" }}>
        Settings
      </h1>

      {/* Account */}
      <div className="set-group">
        <div className="set-label">Account</div>
        <div className="acct-card">
          <span className="acct-av" aria-hidden />
          <div className="acct-tx">
            <b>{linked ? linked.email ?? "Linked learner" : "Anonymous learner"}</b>
            <small>
              {linked
                ? `Synced across devices`
                : userId
                  ? `Device · ${userId.slice(0, 8)}`
                  : "This device"}
            </small>
            <span className="acct-badge">{linked ? "Linked" : "Not linked"}</span>
          </div>
        </div>

        {linked ? (
          <div className="a-card">
            <div className="acct-linked">
              <span className="acct-prov" aria-hidden>
                {linked.provider === "apple" ? (
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="var(--color-ink)">
                    <path d="M11.18 8.49c-.02-1.7 1.39-2.51 1.45-2.55-.79-1.16-2.02-1.32-2.46-1.34-1.05-.11-2.04.61-2.57.61-.53 0-1.35-.6-2.22-.58-1.14.02-2.2.66-2.78 1.68-1.19 2.06-.3 5.1.85 6.77.56.82 1.23 1.74 2.11 1.71.85-.03 1.17-.55 2.2-.55s1.31.55 2.21.53c.91-.02 1.49-.84 2.05-1.66.65-.95.91-1.87.93-1.92-.02-.01-1.78-.68-1.8-2.7zM9.5 3.6c.47-.57.79-1.36.7-2.15-.68.03-1.5.45-1.98 1.02-.43.5-.81 1.31-.71 2.08.76.06 1.53-.39 1.99-.95z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 18 18" width="18" height="18">
                    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
                    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
                    <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33z" />
                    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
                  </svg>
                )}
              </span>
              <div className="acct-info">
                <b>{linked.email ?? "Linked account"}</b>
                <small>{linked.provider}</small>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
            {account.error && (
              <p className="auth-error" role="alert" style={{ marginTop: 10 }}>
                {account.error}
              </p>
            )}
          </div>
        ) : hasProviders ? (
          <div className="a-card">
            <div className="section-label" style={{ margin: "0 0 4px" }}>
              Save your progress
            </div>
            <p style={{ fontSize: 13, color: "var(--color-ink-2)", margin: "0 0 12px" }}>
              Sign in to keep your bank and CEFR history across devices. Your
              current device progress carries over.
            </p>
            <AuthButtons account={account} />
          </div>
        ) : (
          <div className="a-card">
            <div className="section-label" style={{ margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
              Save your progress
              <span className="acct-badge" style={{ background: "var(--color-amber-soft)", color: "var(--color-amber)" }}>
                Coming soon
              </span>
            </div>
            <p style={{ fontSize: 13, color: "var(--color-ink-2)", margin: 0 }}>
              Soon you&apos;ll be able to sign in to keep your bank and CEFR history
              across devices. For now, your progress is saved on this device.
            </p>
          </div>
        )}
      </div>

      {/* Preferences */}
      <div className="set-group">
        <div className="set-label">Preferences</div>
        <div className="set-card">
          <div className="setting-row">
            <span className="si" aria-hidden>🎙</span>
            <div className="st">
              <b>Voice answers</b>
              <small>Allow recording spoken responses</small>
            </div>
            <button
              type="button"
              className="set-toggle"
              role="switch"
              aria-checked={voice}
              aria-pressed={voice}
              aria-label="Toggle voice answers"
              onClick={() => setVoice((v) => !v)}
            />
          </div>
          <div className="setting-row">
            <span className="si" aria-hidden>💾</span>
            <div className="st">
              <b>Auto-save corrections</b>
              <small>Add mistakes to your bank automatically</small>
            </div>
            <button
              type="button"
              className="set-toggle"
              role="switch"
              aria-checked={autoSave}
              aria-pressed={autoSave}
              aria-label="Toggle auto-save"
              onClick={() => setAutoSave((v) => !v)}
            />
          </div>
          <div className="setting-row">
            <span className="si" aria-hidden>🌐</span>
            <div className="st">
              <b>Native language</b>
              <small>Used for translation prompts</small>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-ink-2)" }}>
              中文
            </span>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="set-group">
        <div className="set-label">Appearance</div>
        <div className="theme-seg" role="group" aria-label="Appearance">
          {(["system", "light", "dark"] as Appearance[]).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={appearance === a}
              onClick={() => setAppearance(a)}
            >
              {a[0].toUpperCase() + a.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Data */}
      <div className="set-group">
        <div className="set-label">Data</div>
        <div className="set-card">
          <div className="setting-row">
            <span className="si" aria-hidden>⬇️</span>
            <div className="st">
              <b>Export my data</b>
              <small>Download bank + history as JSON</small>
            </div>
            <button type="button" className="btn btn-ghost btn-sm">
              Export
            </button>
          </div>
          <div className="setting-row danger">
            <span className="si" aria-hidden>🗑️</span>
            <div className="st">
              <b>Delete all data</b>
              <small>Permanently remove this device&apos;s data</small>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onSignOut}>
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="set-group">
        <div className="set-label">About</div>
        <p className="disclaimer">{CEFR_DISCLAIMER}</p>
        <p className="disclaimer" style={{ marginTop: 8 }}>
          Scenario English · adaptive AI coaching. Built as a companion to the
          Daily English ecosystem.
        </p>
      </div>
    </div>
  );
}
