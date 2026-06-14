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

export interface StudyNext {
  kind: "practice";
  reason: string;
  sessionId: string;
  item: StudyItem;
}

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
