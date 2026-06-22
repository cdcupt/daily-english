/**
 * Typed fetch wrapper. Unwraps the `{ data, error, meta }` envelope, injects the
 * Bearer access token, and surfaces a typed `ApiError` on failure. When
 * NEXT_PUBLIC_API_MODE=mock, all calls are routed to the local mock layer so the
 * UI renders without a running backend.
 */
import type { ApiEnvelope } from "./types";
import {
  getAccessToken,
  getRefreshToken,
  updateAccessTokens,
  clearTokens,
} from "./tokens";
import { isMockMode, mockFetch, mockFetchRaw } from "@/mocks/handlers";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.english.daichenlab.com/v1";

// Single in-flight refresh shared across concurrent 401s, so a burst of expired
// requests triggers exactly one /auth/refresh.
let refreshInflight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  if (!refreshInflight) {
    refreshInflight = (async (): Promise<boolean> => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh: rt }),
        });
        if (!res.ok) return false;
        const env = (await res.json()) as ApiEnvelope<{
          access: string;
          refresh: string;
        }>;
        if (env.error || !env.data?.access || !env.data?.refresh) return false;
        updateAccessTokens(env.data.access, env.data.refresh);
        return true;
      } catch {
        return false;
      }
    })();
  }
  const ok = await refreshInflight;
  refreshInflight = null;
  return ok;
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Pre-built FormData (multipart). When set, `body` is ignored. */
  form?: FormData;
  query?: Record<string, string | number | undefined>;
  auth?: boolean;
  /** Internal: set after a refresh retry so we don't loop. */
  _retried?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const base = `${API_URL}${path}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** The data payload plus the envelope `meta` (used by topic-aware study/next). */
export interface RawResult<T> {
  data: T | null;
  meta: unknown;
}

export async function request<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, form, query, auth = true, _retried = false } = opts;

  if (isMockMode()) {
    return mockFetch<T>(path, { method, body, form, query });
  }

  const headers: Record<string, string> = {};
  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (form) {
    payload = form; // browser sets multipart boundary
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), { method, headers, body: payload });
  } catch (err) {
    throw new ApiError(
      "network_error",
      err instanceof Error ? err.message : "Network request failed",
      0,
    );
  }

  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await res.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError("bad_response", "Malformed server response", res.status);
  }

  if (!res.ok || envelope.error) {
    // Access token expired → silently refresh once and retry. /auth/* calls are
    // excluded (the refresh call itself must not recurse).
    if (
      res.status === 401 &&
      auth &&
      !_retried &&
      !path.startsWith("/auth/")
    ) {
      if (await refreshAccessToken()) {
        return request<T>(path, { ...opts, _retried: true });
      }
      // Refresh failed (refresh token also dead) → drop the session so the app
      // falls back to the sign-in gate on next mount/reload.
      clearTokens();
    }
    const e = envelope.error;
    throw new ApiError(
      e?.code ?? "error",
      e?.message ?? `Request failed (${res.status})`,
      res.status,
    );
  }

  return envelope.data as T;
}

/**
 * Like `request<T>`, but returns the envelope `data` AND `meta`. Used by
 * topic-aware `study/next`, where the empty/warming sub-state is carried in
 * `meta.reason` (e.g. "topic_warming" vs "empty_bank") rather than the payload.
 */
export async function requestRaw<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<RawResult<T>> {
  const { method = "GET", body, form, query, auth = true, _retried = false } = opts;

  if (isMockMode()) {
    return mockFetchRaw<T>(path, { method, body, form, query });
  }

  const headers: Record<string, string> = {};
  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), { method, headers, body: payload });
  } catch (err) {
    throw new ApiError(
      "network_error",
      err instanceof Error ? err.message : "Network request failed",
      0,
    );
  }

  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await res.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError("bad_response", "Malformed server response", res.status);
  }

  if (!res.ok || envelope.error) {
    if (res.status === 401 && auth && !_retried && !path.startsWith("/auth/")) {
      if (await refreshAccessToken()) {
        return requestRaw<T>(path, { ...opts, _retried: true });
      }
      clearTokens();
    }
    const e = envelope.error;
    throw new ApiError(
      e?.code ?? "error",
      e?.message ?? `Request failed (${res.status})`,
      res.status,
    );
  }

  return { data: envelope.data, meta: envelope.meta };
}
