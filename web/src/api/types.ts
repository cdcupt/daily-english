/**
 * Client-side mirror of the server payload types. The server has no OpenAPI
 * file yet, so these are hand-maintained against
 * `server/src/schemas.ts` + `server/src/routes/*.ts`. The envelope is always
 * `{ data, error, meta }`.
 */

export interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string } | null;
  meta: unknown;
}

export interface AnonymousAuth {
  userId: string;
  deviceId: string;
  access: string;
  refresh: string;
}

/* ---------- Account / OAuth (server/src/routes/auth.ts) ---------- */

export type AuthProvider = "google" | "apple";

/** GET /v1/auth/config — which social providers are wired up server-side. */
export interface AuthConfig {
  google: { clientId: string | null };
  apple: { clientId: string | null };
}

/**
 * POST /v1/auth/oauth/{google,apple} — exchange a verified provider token for a
 * (re-issued) device session bound to the now-linked account.
 */
export interface OAuthResult {
  userId: string;
  deviceId: string;
  email: string;
  emailVerified: boolean;
  access: string;
  refresh: string;
  provider: AuthProvider;
  linked: boolean;
}

/** GET /v1/auth/me — the current session's identity. */
export interface EmailAuth {
  userId: string;
  deviceId: string;
  email: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  nativeLanguage: string | null;
  role: "user" | "operator";
}

export type ItemType =
  | "scenario_translation"
  | "scenario_dialogue"
  | "topic_description";

export type ItemMode = "translation" | "dialogue" | "description";

export interface StudyScenario {
  title: string;
  category: string;
  userRole: string;
  aiRole: string;
  goal: string;
}

export interface StudyItem {
  itemId: string;
  type: ItemType;
  mode: ItemMode;
  cefrLevel: string;
  promptCn: string;
  learningGoal: string;
  targetPhrases: string[];
  scenario: StudyScenario | null;
}

/** The five SM-2 review prompt flavours emitted by the server (review/prompt.ts). */
export type ReviewKind = "use_pattern" | "ask_politely" | "re_enter_scenario";

/**
 * A spaced-repetition review item resurfaced by GET /v1/study/next when a saved
 * expression is due. `expressionId` is the id passed to POST /v1/review/:id/complete.
 */
export interface ReviewItem {
  expressionId: string;
  type: ExpressionType;
  content: string;
  userOriginal: string | null;
  naturalExpression: string | null;
  prompt: string;
  reviewKind: ReviewKind;
}

/** GET /v1/study/next, adaptive practice branch. */
export interface StudyPractice {
  kind: "practice";
  reason: string;
  sessionId: string;
  item: StudyItem;
}

/** GET /v1/study/next, due spaced-repetition review branch. */
export interface StudyReview {
  kind: "review";
  reason: string;
  sessionId: string;
  review: ReviewItem;
}

/**
 * GET /v1/study/next is a discriminated union on `kind`. The endpoint also
 * resolves to `null` when the bank is empty (meta.reason === "empty_bank").
 */
export type StudyNext = StudyPractice | StudyReview;

export type FeedbackIssueType =
  | "grammar"
  | "vocabulary"
  | "naturalness"
  | "coherence"
  | "register"
  | "task_completion";

export interface FeedbackIssue {
  type: FeedbackIssueType;
  explanation: string;
}

export interface FeedbackPayload {
  original: string;
  corrected: string;
  natural_version: string;
  issues: FeedbackIssue[];
  save_candidates: string[];
}

export interface TurnResult {
  turnId: string;
  turnIndex: number;
  lowConfidence: boolean;
  feedback: FeedbackPayload | null;
  savedExpressionId: string | null;
  saveCandidates: string[];
}

export interface AudioTurnResult extends TurnResult {
  transcript: string;
  asrConfidence: number;
  retry?: { reason: string; message: string } | null;
}

export interface DimensionScore {
  score: number;
  level: string;
}

export interface ScoreReport {
  session_id?: string;
  total: number;
  cefr_estimate: string;
  dimensions: Record<string, DimensionScore>;
  summary: string;
  weak_points: string[];
  recommended_review: string[];
}

export interface AbilityProfile {
  overall_cefr: string;
  stable_range: [string, string];
  dimensions: Record<string, DimensionScore & { ema?: number; n?: number }>;
  weaknesses: string[];
  disclaimer: string;
}

/** One day of the 30-day ability trend. `total` is null on days with no data. */
export interface TrendPoint {
  date: string; // YYYY-MM-DD
  total: number | null;
  dimensions: Record<string, number>;
}

/** GET /v1/profile/trends — windowed ability series for the You surface. */
export interface ProfileTrends {
  days: number;
  series: TrendPoint[];
}

export type ExpressionType =
  | "mistake_pair"
  | "phrase"
  | "collocation"
  | "sentence_frame"
  | "word";

export interface Expression {
  id: string;
  userId: string;
  type: ExpressionType;
  content: string;
  meaningCn: string | null;
  userOriginal: string | null;
  naturalExpression: string | null;
  reviewStatus: unknown;
  createdAt: string;
}

export interface SaveExpressionInput {
  type: ExpressionType;
  content: string;
  meaningCn?: string;
  userOriginal?: string;
  naturalExpression?: string;
  sourceSessionId?: string;
  sourceScenarioId?: string;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
}

/* ---------- Operator / admin surface (server/src/routes/admin.ts) ---------- */

/** Lifecycle states from server/src/content/lifecycle.ts. */
export type ItemStatus =
  | "draft"
  | "generated"
  | "auto_checked"
  | "review_pending"
  | "published"
  | "monitored"
  | "improved"
  | "archived";

/** Per-item quality metrics (nullable when an item has no telemetry yet). */
export interface QuestionQualityMetrics {
  completionRate: number | null;
  saveRate: number | null;
  complaintRate: number | null;
}

/** A row of GET /v1/admin/items. `metrics` is null until telemetry exists. */
export interface AdminItem {
  id: string;
  itemKey: string;
  type: ItemType;
  status: ItemStatus;
  version: number;
  cefrLevel: string;
  difficultyScore: number | null;
  scenarioId: string;
  metrics: QuestionQualityMetrics | null;
}

export interface TransitionResult {
  id: string;
  status: ItemStatus;
}

export interface RegenerateResult {
  id: string;
  status: ItemStatus;
  version: number;
}

export interface GenerateResult {
  id: string;
  status: ItemStatus;
  itemKey: string;
}

export interface GenerateInput {
  scenarioId: string;
  type: ItemType;
  cefrLevel: string;
}
