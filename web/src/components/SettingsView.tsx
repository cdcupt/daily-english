"use client";

import { useState } from "react";
import { CEFR_DISCLAIMER } from "@/lib/constants";
import { getUserId } from "@/api/tokens";

type Appearance = "system" | "light" | "dark";

interface SettingsViewProps {
  onSignOut: () => void;
}

/**
 * Settings surface. Account shows the anonymous badge + a magic-link upgrade
 * stub. Voice / native-language / appearance toggles are client-local. Data
 * export/delete are stubs. About carries the verbatim CEFR disclaimer.
 */
export function SettingsView({ onSignOut }: SettingsViewProps) {
  const [voice, setVoice] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [appearance, setAppearance] = useState<Appearance>("system");
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const userId = getUserId();

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
            <b>Anonymous learner</b>
            <small>{userId ? `Device · ${userId.slice(0, 8)}` : "This device"}</small>
            <span className="acct-badge">Not linked</span>
          </div>
        </div>
        <div className="a-card">
          <div className="section-label" style={{ margin: "0 0 8px" }}>
            Save your progress
          </div>
          <p style={{ fontSize: 13, color: "var(--color-ink-2)", margin: "0 0 10px" }}>
            Add an email to keep your bank and CEFR history across devices. We&apos;ll
            send a magic link — no password.
          </p>
          {magicSent ? (
            <p style={{ fontSize: 13, color: "var(--color-teal-700)", fontWeight: 700 }}>
              ✓ Magic link sent to {magicEmail} (demo stub)
            </p>
          ) : (
            <div className="magic-input">
              <input
                type="email"
                inputMode="email"
                placeholder="you@example.com"
                aria-label="Email for magic link"
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!magicEmail.includes("@")}
                onClick={() => setMagicSent(true)}
              >
                Send link
              </button>
            </div>
          )}
        </div>
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
