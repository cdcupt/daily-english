import {
  pgTable, pgEnum, uuid, text, integer, real, boolean, timestamp, jsonb, index, uniqueIndex, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Data model for the AI Scenario English Trainer (TECH §B2).
 * Stable relational fields are real columns (indexed/joined); AI-variable
 * structures (rubric, dimensions, issues, metrics) are jsonb validated by Zod
 * on write. Eleven tables.
 */

// ---------- Enums ----------
export const itemTypeEnum = pgEnum('item_type', [
  'scenario_translation', 'scenario_dialogue', 'topic_description',
]);
export const itemStatusEnum = pgEnum('item_status', [
  'draft', 'generated', 'auto_checked', 'review_pending', 'published', 'monitored', 'improved', 'archived',
]);
export const sessionStateEnum = pgEnum('session_state', ['active', 'completed', 'abandoned']);
export const inputTypeEnum = pgEnum('input_type', ['text', 'audio']);
export const expressionTypeEnum = pgEnum('expression_type', [
  'vocabulary', 'sentence_pattern', 'mistake_pair', 'saved', 'scenario_phrase',
]);
export const reviewKindEnum = pgEnum('review_kind', ['use_pattern', 'ask_politely', 're_enter_scenario']);
export const reviewStateEnum = pgEnum('review_state', ['pending', 'served', 'completed', 'skipped']);
export const sourceTypeEnum = pgEnum('source_type', [
  'ai_generated', 'original', 'tatoeba', 'cefr_descriptor', 'user_generated',
]);

// ---------- JSON shapes (typed jsonb) ----------
export type Rubric = {
  vocabulary: number; grammar: number; naturalness: number; task_completion: number; pronunciation: number;
};
export type CommonMistake = { wrong: string; explanation: string };
export type FeedbackIssue = { type: string; explanation: string };
export type FeedbackPayload = {
  original: string; corrected: string; natural_version: string;
  issues: FeedbackIssue[]; save_candidates: string[];
};
export type DimensionScore = { score: number; level: string; n?: number; ema?: number };
export type ScoreReport = {
  session_id: string; total: number; cefr_estimate: string;
  dimensions: Record<string, DimensionScore>;
  summary: string; weak_points: string[]; recommended_review: string[];
  next_task: string | null; excluded_turns: string[]; disclaimer: string;
};
export type ReviewStatus = { next_review_at: string; mastery: number; ease: number; reps: number; intervalDays?: number };
export type SpeechFeatures = { rate_wpm?: number; pause_ratio?: number; repetition_rate?: number };

// ---------- Tables ----------
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  deviceId: text('device_id').notNull(),
  email: text('email'),
  emailVerified: boolean('email_verified').notNull().default(false),
  nativeLanguage: text('native_language').notNull().default('zh'),
  isOperator: boolean('is_operator').notNull().default(false),
  mergedInto: uuid('merged_into'),
  // Bumped on sign-out/merge to invalidate stale refresh tokens with one write
  // (claims carry the version; refresh rejects when it no longer matches).
  tokenVersion: integer('token_version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  deviceIdx: uniqueIndex('users_device_id').on(t.deviceId),
  emailIdx: uniqueIndex('users_email').on(t.email),
}));

// Social sign-in identities (accounts v1: attach + sign-in via Google/Apple).
// One row per (provider, provider_sub); a user may have several (e.g. Google on
// web + Apple on iOS) all pointing at the same user_id. The provider's signed
// ID token is verified at the route (auth/oauth.ts) before a row is created.
export const oauthIdentities = pgTable('oauth_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  // 'google' | 'apple' | 'test' — constrained by a CHECK in the migration.
  // 'test' is the secret-gated E2E namespace (POST /v1/auth/test-login); it can
  // never collide with a real social identity.
  provider: text('provider').notNull(),
  // The provider's stable subject id for this account ('sub' claim).
  providerSub: text('provider_sub').notNull(),
  // Email at link time (may be a verified private-relay address for Apple); the
  // canonical email lives on users — this is an audit/debug copy.
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  providerSubIdx: uniqueIndex('oauth_provider_sub').on(t.provider, t.providerSub),
  userIdx: index('oauth_user_id').on(t.userId),
  providerCheck: check('oauth_provider_check', sql`${t.provider} IN ('google', 'apple', 'test')`),
}));

export const contentSources = pgTable('content_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: sourceTypeEnum('type').notNull(),
  license: text('license').notNull(),
  attribution: text('attribution'),
  reviewedBy: text('reviewed_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scenarios = pgTable('scenarios', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  cefrBand: text('cefr_band').notNull(),
  userRole: text('user_role').notNull(),
  aiRole: text('ai_role').notNull(),
  goal: text('goal').notNull(),
  keyPhrases: jsonb('key_phrases').$type<string[]>().notNull().default([]),
  commonMistakes: jsonb('common_mistakes').$type<string[]>().notNull().default([]),
  practiceModes: text('practice_modes').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugIdx: uniqueIndex('scenarios_slug').on(t.slug),
  categoryIdx: index('scenarios_category').on(t.category),
  cefrIdx: index('scenarios_cefr').on(t.cefrBand),
}));

export const questionItems = pgTable('question_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemKey: text('item_key').notNull(),
  scenarioId: uuid('scenario_id').notNull().references(() => scenarios.id),
  type: itemTypeEnum('type').notNull(),
  status: itemStatusEnum('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  cefrLevel: text('cefr_level').notNull(),
  difficultyScore: integer('difficulty_score').notNull(),
  learningGoal: text('learning_goal').notNull(),
  promptCn: text('prompt_cn'),
  referenceAnswers: jsonb('reference_answers').$type<string[]>().notNull().default([]),
  targetPhrases: jsonb('target_phrases').$type<string[]>().notNull().default([]),
  commonMistakes: jsonb('common_mistakes').$type<CommonMistake[]>().notNull().default([]),
  rubric: jsonb('rubric').$type<Rubric>().notNull(),
  sourceId: uuid('source_id').references(() => contentSources.id),
  // Set on AI-generated custom-topic items, linking them to their topic_sessions
  // cache row so study/next can narrow the pool to a single custom topic.
  topicSessionId: uuid('topic_session_id').references(() => topicSessions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  itemKeyIdx: uniqueIndex('qi_item_key').on(t.itemKey),
  adaptiveIdx: index('qi_adaptive').on(t.status, t.cefrLevel, t.difficultyScore),
  scenarioIdx: index('qi_scenario').on(t.scenarioId),
  topicSessionIdx: index('qi_topic_session').on(t.topicSessionId, t.status),
}));

// Topic-session cache (Topic Sessions design): a custom free-text topic is
// normalized → moderated → AI-scaffolded → a small batch of items generated,
// then CACHED BY NORMALIZED TOPIC ONLY (shared, level-agnostic — adaptive
// selection handles level fit). One row per distinct normalized topic.
export const topicSessions = pgTable('topic_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Cache key: normalized form of the raw topic (lowercased/slug, CJK allowed).
  normalizedTopic: text('normalized_topic').notNull(),
  // The user's original typed topic (for display / provenance).
  rawTopic: text('raw_topic').notNull(),
  cefrBand: text('cefr_band').notNull(),
  // generating → ready (first item published) | failed (off-domain / gen error).
  status: text('status').notNull().default('generating'),
  itemCount: integer('item_count').notNull().default(0),
  // pending → allowed | blocked (moderation gate; blocked never serves).
  moderationStatus: text('moderation_status').notNull().default('pending'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  normalizedIdx: uniqueIndex('topic_sessions_normalized').on(t.normalizedTopic),
  statusCheck: check('topic_sessions_status_check', sql`${t.status} IN ('generating', 'ready', 'failed')`),
  moderationCheck: check('topic_sessions_moderation_check', sql`${t.moderationStatus} IN ('pending', 'allowed', 'blocked')`),
}));

export const practiceSessions = pgTable('practice_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  mode: text('mode').notNull(),
  state: sessionStateEnum('state').notNull().default('active'),
  scoreReport: jsonb('score_report').$type<ScoreReport>(),
  // Per-session, opt-in topic steering (Topic Sessions). Nullable + additive →
  // a session with no topic behaves exactly as before (full adaptive feed).
  // 'category' → topicCategory holds a scenario.category; 'custom' → topicSessionId
  // points at a topic_sessions cache row. topicLabel is the display label.
  topicKind: text('topic_kind'),
  topicCategory: text('topic_category'),
  topicSessionId: uuid('topic_session_id').references(() => topicSessions.id),
  topicLabel: text('topic_label'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (t) => ({
  userIdx: index('ps_user_started').on(t.userId, t.startedAt),
  topicKindCheck: check('ps_topic_kind_check', sql`${t.topicKind} IS NULL OR ${t.topicKind} IN ('category', 'custom')`),
}));

export const practiceTurns = pgTable('practice_turns', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => practiceSessions.id),
  itemId: uuid('item_id').references(() => questionItems.id),
  turnIndex: integer('turn_index').notNull(),
  inputType: inputTypeEnum('input_type').notNull(),
  userText: text('user_text'),
  audioUrl: text('audio_url'),
  transcript: text('transcript'),
  asrConfidence: real('asr_confidence'),
  asrWords: jsonb('asr_words'),
  speechFeatures: jsonb('speech_features').$type<SpeechFeatures>(),
  lowConfidence: boolean('low_confidence').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionIdx: index('pt_session_turn').on(t.sessionId, t.turnIndex),
}));

export const aiFeedbackItems = pgTable('ai_feedback_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  turnId: uuid('turn_id').notNull().references(() => practiceTurns.id),
  payload: jsonb('payload').$type<FeedbackPayload>().notNull(),
  rawModelOutput: jsonb('raw_model_output'),
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
  repaired: boolean('repaired').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  turnIdx: uniqueIndex('afi_turn').on(t.turnId),
}));

export const expressionBankItems = pgTable('expression_bank_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: expressionTypeEnum('type').notNull(),
  content: text('content').notNull(),
  meaningCn: text('meaning_cn'),
  userOriginal: text('user_original'),
  naturalExpression: text('natural_expression'),
  sourceSessionId: uuid('source_session_id').references(() => practiceSessions.id),
  sourceScenarioId: uuid('source_scenario_id').references(() => scenarios.id),
  reviewStatus: jsonb('review_status').$type<ReviewStatus>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userTypeIdx: index('ebi_user_type').on(t.userId, t.type),
}));

export const reviewTasks = pgTable('review_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  expressionId: uuid('expression_id').notNull().references(() => expressionBankItems.id),
  prompt: text('prompt').notNull(),
  kind: reviewKindEnum('kind').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  state: reviewStateEnum('state').notNull().default('pending'),
  generatedBy: text('generated_by').notNull().default('system'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  queueIdx: index('rt_user_state_due').on(t.userId, t.state, t.dueAt),
}));

export const userAbilityProfiles = pgTable('user_ability_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  overallCefr: text('overall_cefr').notNull().default('A1'),
  stableRange: text('stable_range').array().notNull().default(['A1', 'A1']),
  dimensions: jsonb('dimensions').$type<Record<string, DimensionScore>>().notNull().default({}),
  weaknesses: jsonb('weaknesses').$type<string[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiTaskConfig = pgTable('ai_task_config', {
  task: text('task').primaryKey(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  fallbackModel: text('fallback_model'),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dimensionSnapshots = pgTable('dimension_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  total: integer('total').notNull(),
  overallCefr: text('overall_cefr').notNull(),
  dimensions: jsonb('dimensions').$type<Record<string, DimensionScore>>().notNull(),
}, (t) => ({
  userTimeIdx: index('ds_user_time').on(t.userId, t.capturedAt),
}));

export const questionQualityMetrics = pgTable('question_quality_metrics', {
  itemId: uuid('item_id').primaryKey().references(() => questionItems.id),
  completionRate: real('completion_rate').notNull().default(0),
  dropoffRate: real('dropoff_rate').notNull().default(0),
  averageScore: real('average_score').notNull().default(0),
  saveRate: real('save_rate').notNull().default(0),
  complaintRate: real('complaint_rate').notNull().default(0),
  sampleN: integer('sample_n').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
