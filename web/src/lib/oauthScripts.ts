/**
 * Loaders + minimal typings for the two third-party identity SDKs.
 *
 * Both are loaded on demand (the first time a provider button mounts) rather
 * than eagerly, so a dormant config — both clientIds null — ships zero extra
 * network weight. Each loader is idempotent and de-duplicates concurrent calls.
 */

const GIS_SRC = "https://accounts.google.com/gsi/client";
const APPLE_SRC =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

/** Google Identity Services credential callback payload (the part we use). */
export interface GoogleCredentialResponse {
  credential: string; // a Google ID token (JWT)
}

interface GoogleIdConfig {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  nonce?: string;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
}

interface GoogleButtonOptions {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "small" | "medium" | "large";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  width?: number;
  logo_alignment?: "left" | "center";
}

export interface GoogleAccountsId {
  initialize: (config: GoogleIdConfig) => void;
  renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
  prompt: () => void;
  disableAutoSelect: () => void;
}

interface AppleAuthConfig {
  clientId: string;
  scope: string;
  redirectURI: string;
  nonce?: string;
  state?: string;
  usePopup?: boolean;
}

export interface AppleSignInResponse {
  authorization: {
    code: string;
    id_token: string;
    state?: string;
  };
  user?: {
    email?: string;
    name?: { firstName?: string; lastName?: string };
  };
}

interface AppleIDAuth {
  init: (config: AppleAuthConfig) => void;
  signIn: () => Promise<AppleSignInResponse>;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
    AppleID?: { auth?: AppleIDAuth };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Script loading requires a browser"));
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`Failed to load ${src}`)),
        { once: true },
      );
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.defer = true;
    el.addEventListener(
      "load",
      () => {
        el.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    el.addEventListener(
      "error",
      () => reject(new Error(`Failed to load ${src}`)),
      { once: true },
    );
    document.head.appendChild(el);
  });
}

/** Load Google Identity Services and resolve with `google.accounts.id`. */
export async function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  await loadScript(GIS_SRC);
  const id = window.google?.accounts?.id;
  if (!id) throw new Error("Google Identity Services unavailable");
  return id;
}

/** Load Apple's appleid.auth.js and resolve with `AppleID.auth`. */
export async function loadAppleId(): Promise<AppleIDAuth> {
  await loadScript(APPLE_SRC);
  const auth = window.AppleID?.auth;
  if (!auth) throw new Error("Apple Sign In unavailable");
  return auth;
}

/** A fresh per-attempt nonce; the backend verifies it when present. */
export function freshNonce(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** The Apple redirect URI registered for this Services ID. */
export const APPLE_REDIRECT_URI =
  "https://english.daichenlab.com/auth/apple/callback";
