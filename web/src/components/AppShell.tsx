"use client";

import type { ReactNode } from "react";
import { APP_MODE } from "@/lib/constants";

export type Surface = "study" | "you" | "settings";

interface NavItem {
  id: Surface;
  label: string;
  icon: ReactNode;
}

const ITEMS: NavItem[] = [
  {
    id: "study",
    label: "Study",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 19.5V6a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v13" />
        <path d="M6 17h12" />
        <path d="M9 8h6M9 11h4" />
      </svg>
    ),
  },
  {
    id: "you",
    label: "You",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 2.4 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7 2.4h.1A1.7 1.7 0 0 0 8 1V1a2 2 0 0 1 4 0v.1A1.7 1.7 0 0 0 15 2.4" />
      </svg>
    ),
  },
];

interface AppShellProps {
  active: Surface;
  onNavigate: (s: Surface) => void;
  children: ReactNode;
}

export function AppShell({ active, onNavigate, children }: AppShellProps) {
  return (
    <>
      <nav className="web-nav" aria-label="Primary">
        <span className="brand">
          Scenario<span className="dot">.</span>
        </span>
        {ITEMS.map((it) => (
          <button
            key={it.id}
            type="button"
            aria-current={active === it.id ? "page" : undefined}
            onClick={() => onNavigate(it.id)}
          >
            {it.label}
          </button>
        ))}
        <span className="spacer" />
        {APP_MODE === "mock" && <span className="mode-badge">Demo data</span>}
      </nav>

      <main id="main" className="app-shell">
        {children}
      </main>

      <nav className="tabbar" aria-label="Primary">
        {ITEMS.map((it) => (
          <button
            key={it.id}
            type="button"
            aria-current={active === it.id ? "page" : undefined}
            onClick={() => onNavigate(it.id)}
          >
            <span className="ti">{it.icon}</span>
            {it.label}
          </button>
        ))}
      </nav>
    </>
  );
}
