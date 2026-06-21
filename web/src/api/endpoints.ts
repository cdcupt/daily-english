/**
 * Typed endpoint functions mirroring the real server routes. Each unwraps the
 * envelope via `request<T>` and returns the typed payload.
 */
import { request } from "./client";
import { storeTokens, clearTokens, getDeviceId } from "./tokens";
import type {
  AnonymousAuth,
  AuthConfig,
  OAuthResult,
  EmailAuth,
  StudyNext,
  TurnResult,
  AudioTurnResult,
  ScoreReport,
  AbilityProfile,
  ProfileTrends,
  Expression,
  SaveExpressionInput,
  ExpressionType,
  Paginated,
  AdminItem,
  ItemStatus,
  TransitionResult,
  RegenerateResult,
  GenerateResult,
  GenerateInput,
} from "./types";

/** POST /v1/auth/anonymous — create or resume the device session, store tokens. */
export async function authAnonymous(): Promise<AnonymousAuth> {
  const deviceId = getDeviceId() ?? undefined;
  const auth = await request<AnonymousAuth>("/auth/anonymous", {
    method: "POST",
    auth: false,
    body: deviceId ? { deviceId } : {},
  });
  storeTokens({
    access: auth.access,
    refresh: auth.refresh,
    userId: auth.userId,
    deviceId: auth.deviceId,
  });
  return auth;
}

/* ---------- Account / OAuth ---------- */

/** GET /v1/auth/config — which social providers are enabled (public). */
export function getAuthConfig(): Promise<AuthConfig> {
  return request<AuthConfig>("/auth/config", { method: "GET", auth: false });
}

/**
 * POST /v1/auth/oauth/google — exchange a Google ID token for a linked session.
 * Persists the re-issued tokens plus the account identity (email / provider).
 */
export async function oauthGoogle(
  idToken: string,
  nonce?: string,
): Promise<OAuthResult> {
  const result = await request<OAuthResult>("/auth/oauth/google", {
    method: "POST",
    auth: false,
    body: nonce ? { idToken, nonce } : { idToken },
  });
  persistOAuth(result);
  return result;
}

/** POST /v1/auth/oauth/apple — exchange an Apple identity token for a session. */
export async function oauthApple(
  identityToken: string,
  nonce?: string,
): Promise<OAuthResult> {
  const result = await request<OAuthResult>("/auth/oauth/apple", {
    method: "POST",
    auth: false,
    body: nonce ? { identityToken, nonce } : { identityToken },
  });
  persistOAuth(result);
  return result;
}

/** GET /v1/auth/me — the current session's identity (requires a token). */
export function getMe(): Promise<EmailAuth> {
  return request<EmailAuth>("/auth/me", { method: "GET" });
}

/**
 * POST /v1/auth/signout — bumps the server token_version (invalidating the
 * current tokens), then clears local tokens and re-establishes an anonymous
 * session so the user is never left tokenless.
 */
export async function signOut(): Promise<AnonymousAuth> {
  try {
    await request<{ ok: boolean }>("/auth/signout", { method: "POST" });
  } catch {
    // The server may already consider the token stale; clear locally regardless.
  }
  clearTokens();
  return authAnonymous();
}

/** Persist an OAuth exchange result as the active linked session. */
function persistOAuth(result: OAuthResult): void {
  storeTokens({
    access: result.access,
    refresh: result.refresh,
    userId: result.userId,
    deviceId: result.deviceId,
    email: result.email,
    provider: result.provider,
    emailVerified: result.emailVerified,
  });
}

/** GET /v1/study/next — the adaptive feed item. */
export function studyNext(): Promise<StudyNext> {
  return request<StudyNext>("/study/next", { method: "GET" });
}

/** POST /v1/sessions/:id/turns — submit a text answer, get 3-tier feedback. */
export function submitTextTurn(
  sessionId: string,
  itemId: string,
  userText: string,
): Promise<TurnResult> {
  return request<TurnResult>(`/sessions/${sessionId}/turns`, {
    method: "POST",
    body: { itemId, userText },
  });
}

/** POST /v1/sessions/:id/turns/audio — submit recorded audio (multipart). */
export function submitAudioTurn(
  sessionId: string,
  itemId: string,
  audio: Blob,
  filename = "answer.webm",
): Promise<AudioTurnResult> {
  const form = new FormData();
  form.append("itemId", itemId);
  form.append("audio", audio, filename);
  return request<AudioTurnResult>(`/sessions/${sessionId}/turns/audio`, {
    method: "POST",
    form,
  });
}

/** POST /v1/sessions/:id/finish — compute the session ScoreReport. */
export function finishSession(sessionId: string): Promise<ScoreReport> {
  return request<ScoreReport>(`/sessions/${sessionId}/finish`, {
    method: "POST",
  });
}

/** GET /v1/profile — long-term ability profile for the You surface. */
export function getProfile(): Promise<AbilityProfile> {
  return request<AbilityProfile>("/profile", { method: "GET" });
}

/** GET /v1/profile/trends?days=30 — windowed ability series for the You surface. */
export function getProfileTrends(days = 30): Promise<ProfileTrends> {
  return request<ProfileTrends>("/profile/trends", {
    method: "GET",
    query: { days },
  });
}

/** GET /v1/expressions — paginated bank, optionally filtered by type. */
export async function listExpressions(
  type?: ExpressionType,
  page = 1,
  limit = 20,
): Promise<Paginated<Expression>> {
  const rows = await request<Expression[]>("/expressions", {
    method: "GET",
    query: { type, page, limit },
  });
  return { rows, total: rows.length, page, limit };
}

/** POST /v1/expressions — save (idempotent). */
export function saveExpression(input: SaveExpressionInput): Promise<Expression> {
  return request<Expression>("/expressions", { method: "POST", body: input });
}

/** DELETE /v1/expressions/:id */
export function deleteExpression(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/expressions/${id}`, {
    method: "DELETE",
  });
}

/* ---------- Operator / admin (requires an operator access token) ---------- */

/** GET /v1/admin/items — full question-bank list with status + quality metrics. */
export function adminListItems(): Promise<AdminItem[]> {
  return request<AdminItem[]>("/admin/items", { method: "GET" });
}

/** POST /v1/admin/items/:id/transition — move an item to an allowed next state. */
export function adminTransitionItem(
  id: string,
  to: ItemStatus,
): Promise<TransitionResult> {
  return request<TransitionResult>(`/admin/items/${id}/transition`, {
    method: "POST",
    body: { to },
  });
}

/** POST /v1/admin/items/:id/regenerate — AI-regenerate into a new draft version. */
export function adminRegenerateItem(id: string): Promise<RegenerateResult> {
  return request<RegenerateResult>(`/admin/items/${id}/regenerate`, {
    method: "POST",
  });
}

/** POST /v1/admin/generate — generate a brand-new item draft for a scenario. */
export function adminGenerateItem(
  input: GenerateInput,
): Promise<GenerateResult> {
  return request<GenerateResult>("/admin/generate", {
    method: "POST",
    body: input,
  });
}
