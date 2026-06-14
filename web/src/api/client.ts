/**
 * Typed fetch wrapper. Unwraps the `{ data, error, meta }` envelope, injects the
 * Bearer access token, and surfaces a typed `ApiError` on failure. When
 * NEXT_PUBLIC_API_MODE=mock, all calls are routed to the local mock layer so the
 * UI renders without a running backend.
 */
import type { ApiEnvelope } from "./types";
import { getAccessToken } from "./tokens";
import { isMockMode, mockFetch } from "@/mocks/handlers";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.english.daichenlab.com/v1";

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

export async function request<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, form, query, auth = true } = opts;

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
    const e = envelope.error;
    throw new ApiError(
      e?.code ?? "error",
      e?.message ?? `Request failed (${res.status})`,
      res.status,
    );
  }

  return envelope.data as T;
}
