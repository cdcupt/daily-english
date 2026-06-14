/**
 * Token storage for the anonymous device session. localStorage-backed so the
 * session survives reloads. Falls back to an in-memory store when running
 * server-side (SSR) or where storage is unavailable.
 */

const ACCESS_KEY = "se.access";
const REFRESH_KEY = "se.refresh";
const USER_KEY = "se.userId";
const DEVICE_KEY = "se.deviceId";

interface StoredTokens {
  access: string;
  refresh: string;
  userId: string;
  deviceId: string;
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

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export function storeTokens(t: StoredTokens): void {
  if (hasStorage()) {
    window.localStorage.setItem(ACCESS_KEY, t.access);
    window.localStorage.setItem(REFRESH_KEY, t.refresh);
    window.localStorage.setItem(USER_KEY, t.userId);
    window.localStorage.setItem(DEVICE_KEY, t.deviceId);
  } else {
    memory = { ...t };
  }
}

export function clearTokens(): void {
  if (hasStorage()) {
    [ACCESS_KEY, REFRESH_KEY, USER_KEY, DEVICE_KEY].forEach((k) =>
      window.localStorage.removeItem(k),
    );
  }
  memory = {};
}
