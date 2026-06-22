/**
 * Token storage for the anonymous device session. localStorage-backed so the
 * session survives reloads. Falls back to an in-memory store when running
 * server-side (SSR) or where storage is unavailable.
 */

const ACCESS_KEY = "se.access";
const REFRESH_KEY = "se.refresh";
const USER_KEY = "se.userId";
const DEVICE_KEY = "se.deviceId";
const EMAIL_KEY = "se.email";
const PROVIDER_KEY = "se.provider";
const EMAIL_VERIFIED_KEY = "se.emailVerified";

type LinkedProvider = "google" | "apple";

interface StoredTokens {
  access: string;
  refresh: string;
  userId: string;
  deviceId: string;
  /** Set only for a linked (non-anonymous) session. */
  email?: string | null;
  provider?: LinkedProvider | null;
  emailVerified?: boolean | null;
}

/** The persisted account identity, read synchronously to avoid a flash. */
export interface StoredAccount {
  email: string | null;
  provider: LinkedProvider | null;
  emailVerified: boolean;
}

let memory: Partial<StoredTokens> = {};

function hasStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function getAccessToken(): string | null {
  if (hasStorage()) return window.localStorage.getItem(ACCESS_KEY);
  return memory.access ?? null;
}

export function getDeviceId(): string | null {
  if (hasStorage()) return window.localStorage.getItem(DEVICE_KEY);
  return memory.deviceId ?? null;
}

export function getUserId(): string | null {
  if (hasStorage()) return window.localStorage.getItem(USER_KEY);
  return memory.userId ?? null;
}

export function getRefreshToken(): string | null {
  if (hasStorage()) return window.localStorage.getItem(REFRESH_KEY);
  return memory.refresh ?? null;
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

/**
 * Replace ONLY the access+refresh pair after a silent token refresh, preserving
 * the stored identity (userId/deviceId/email/provider) — the /auth/refresh
 * response carries just the rotated token pair.
 */
export function updateAccessTokens(access: string, refresh: string): void {
  if (hasStorage()) {
    window.localStorage.setItem(ACCESS_KEY, access);
    window.localStorage.setItem(REFRESH_KEY, refresh);
  } else {
    memory.access = access;
    memory.refresh = refresh;
  }
}

/**
 * The persisted account identity. Returns `email: null` for an anonymous
 * session. Read synchronously from storage so the UI can seed without a flash.
 */
export function getStoredAccount(): StoredAccount {
  const read = (key: string): string | null =>
    hasStorage() ? window.localStorage.getItem(key) : null;
  if (hasStorage()) {
    const provider = read(PROVIDER_KEY);
    return {
      email: read(EMAIL_KEY),
      provider: provider === "google" || provider === "apple" ? provider : null,
      emailVerified: read(EMAIL_VERIFIED_KEY) === "true",
    };
  }
  return {
    email: memory.email ?? null,
    provider: memory.provider ?? null,
    emailVerified: memory.emailVerified ?? false,
  };
}

/**
 * Decode the `role` claim from the stored access token. The server issues a JWT
 * (`{ sub, role, ... }`); we read the role claim WITHOUT verifying the signature
 * — verification is the server's job, this only decides which UI to render. The
 * admin surface is still fully gated server-side (operators get data, everyone
 * else gets a 404), so a forged client claim reveals nothing.
 */
export function getRole(): "user" | "operator" | null {
  const token = getAccessToken();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob === "function"
        ? atob(payload)
        : Buffer.from(payload, "base64").toString("binary");
    const claims = JSON.parse(json) as { role?: string };
    return claims.role === "operator" ? "operator" : "user";
  } catch {
    return null;
  }
}

export function isOperator(): boolean {
  return getRole() === "operator";
}

export function storeTokens(t: StoredTokens): void {
  if (hasStorage()) {
    window.localStorage.setItem(ACCESS_KEY, t.access);
    window.localStorage.setItem(REFRESH_KEY, t.refresh);
    window.localStorage.setItem(USER_KEY, t.userId);
    window.localStorage.setItem(DEVICE_KEY, t.deviceId);
    // Account fields: present on a linked OAuth session, absent for anonymous.
    if (t.provider) {
      window.localStorage.setItem(PROVIDER_KEY, t.provider);
      window.localStorage.setItem(EMAIL_KEY, t.email ?? "");
      window.localStorage.setItem(
        EMAIL_VERIFIED_KEY,
        t.emailVerified ? "true" : "false",
      );
    } else {
      [EMAIL_KEY, PROVIDER_KEY, EMAIL_VERIFIED_KEY].forEach((k) =>
        window.localStorage.removeItem(k),
      );
    }
  } else {
    memory = { ...t };
  }
}

export function clearTokens(): void {
  if (hasStorage()) {
    [
      ACCESS_KEY,
      REFRESH_KEY,
      USER_KEY,
      DEVICE_KEY,
      EMAIL_KEY,
      PROVIDER_KEY,
      EMAIL_VERIFIED_KEY,
    ].forEach((k) => window.localStorage.removeItem(k));
  }
  memory = {};
}
