import {
  pgTable, pgEnum, uuid, text, integer, real, boolean, timestamp, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  deviceIdx: uniqueIndex('users_device_id').on(t.deviceId),
  emailIdx: uniqueIndex('users_email').on(t.email),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  itemKeyIdx: uniqueIndex('qi_item_key').on(t.itemKey),
  adaptiveIdx: index('qi_adaptive').on(t.status, t.cefrLevel, t.difficultyScore),
  scenarioIdx: index('qi_scenario').on(t.scenarioId),
}));

export const practiceSessions = pgTable('practice_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  mode: text('mode').notNull(),
  state: sessionStateEnum('state').notNull().default('active'),
  scoreReport: jsonb('score_report').$type<ScoreReport>(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (t) => ({
  userIdx: index('ps_user_started').on(t.userId, t.startedAt),
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
