/**
 * Lightweight fetch-mock toggled by NEXT_PUBLIC_API_MODE=mock. Returns realistic
 * sample responses so every learner surface renders without a running backend.
 * It intentionally mirrors the real envelope-unwrapped payloads (the client's
 * `request<T>` has already done the unwrapping for the live path, so the mock
 * returns the inner `data` directly).
 */
import type {
  AnonymousAuth,
  StudyNext,
  TurnResult,
  AudioTurnResult,
  ScoreReport,
  AbilityProfile,
  Expression,
  FeedbackPayload,
} from "@/api/types";

export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_API_MODE === "mock";
}

interface MockRequest {
  method?: string;
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | undefined>;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SAMPLE_FEEDBACK: FeedbackPayload = {
  original: "I want to book a table for two person at 7 o'clock tonight.",
  corrected: "I'd like to book a table for two at 7 o'clock tonight.",
  natural_version:
    "Hi, could I reserve a table for two this evening, around seven?",
  issues: [
    {
      type: "grammar",
      explanation: '"two person" should be "two" or "two people" — count nouns take the plural.',
    },
    {
      type: "register",
      explanation: '"I want" sounds blunt in a restaurant; "I\'d like" or "could I" is more polite.',
    },
    {
      type: "naturalness",
      explanation: '"this evening, around seven" reads more naturally than "at 7 o\'clock tonight".',
    },
  ],
  save_candidates: [
    "I'd like to book a table for two",
    "could I reserve a table",
    "this evening, around seven",
  ],
};

let exprSeq = 100;
const mockExpressions: Expression[] = [
  {
    id: "exp-1",
    userId: "mock-user",
    type: "mistake_pair",
    content: "two person → for two",
    meaningCn: "两个人（用 for two，而非 two person）",
    userOriginal: "a table for two person",
    naturalExpression: "a table for two",
    reviewStatus: { due: true },
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "exp-2",
    userId: "mock-user",
    type: "phrase",
    content: "I'd like to book a table",
    meaningCn: "我想订一张桌子",
    userOriginal: null,
    naturalExpression: null,
    reviewStatus: { due: false },
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "exp-3",
    userId: "mock-user",
    type: "collocation",
    content: "make a reservation",
    meaningCn: "预订",
    userOriginal: null,
    naturalExpression: null,
    reviewStatus: { due: false },
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: "exp-4",
    userId: "mock-user",
    type: "word",
    content: "complimentary",
    meaningCn: "免费赠送的",
    userOriginal: null,
    naturalExpression: null,
    reviewStatus: { due: true },
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
];

const PROFILE: AbilityProfile = {
  overall_cefr: "B1",
  stable_range: ["A2", "B1"],
  dimensions: {
    vocabulary: { score: 72, level: "B1" },
    grammar: { score: 64, level: "B1" },
    coherence: { score: 70, level: "B1" },
    interaction: { score: 58, level: "A2" },
    fluency: { score: 61, level: "B1" },
    pronunciation: { score: 66, level: "B1" },
  },
  weaknesses: ["Interaction turn-taking", "Past-tense consistency"],
  disclaimer:
    "Your current CEFR level is an AI estimate for learning reference only. It is not an official language test score or certification.",
};

const STUDY_NEXT: StudyNext = {
  kind: "practice",
  reason: "adaptive",
  sessionId: "mock-session-1",
  item: {
    itemId: "item-101",
    type: "scenario_translation",
    mode: "translation",
    cefrLevel: "B1",
    promptCn: "我想订今晚七点、两个人的位子。",
    learningGoal: "Make a polite restaurant reservation",
    targetPhrases: ["book a table", "for two", "this evening"],
    scenario: {
      title: "Reserving a table",
      category: "Dining",
      userRole: "Customer",
      aiRole: "Restaurant host",
      goal: "Reserve a table for tonight",
    },
  },
};

const SCORE_REPORT: ScoreReport = {
  session_id: "mock-session-1",
  total: 78,
  cefr_estimate: "B1",
  dimensions: {
    vocabulary: { score: 80, level: "B1" },
    grammar: { score: 74, level: "B1" },
    coherence: { score: 79, level: "B1" },
    interaction: { score: 70, level: "B1" },
    fluency: { score: 77, level: "B1" },
    pronunciation: { score: 82, level: "B2" },
  },
  summary:
    "Clear, polite request with a small count-noun slip. Your phrasing is becoming more natural — keep practising softer openers.",
  weak_points: ["Count nouns (two people)", "Polite register openers"],
  recommended_review: ["a table for two", "could I reserve"],
};

export async function mockFetch<T>(
  path: string,
  req: MockRequest,
): Promise<T> {
  await delay(path.includes("/turns") ? 700 : 250);
  const method = (req.method ?? "GET").toUpperCase();

  if (path === "/auth/anonymous") {
    return {
      userId: "mock-user",
      deviceId: "mock-device",
      access: "mock-access-token",
      refresh: "mock-refresh-token",
    } satisfies AnonymousAuth as T;
  }

  if (path === "/study/next") {
    return STUDY_NEXT as T;
  }

  if (/\/sessions\/.+\/turns\/audio$/.test(path)) {
    const result: AudioTurnResult = {
      turnId: "turn-audio-1",
      turnIndex: 0,
      transcript: "I want to book a table for two person at 7 o'clock tonight.",
      asrConfidence: 0.93,
      lowConfidence: false,
      feedback: SAMPLE_FEEDBACK,
      savedExpressionId: "exp-1",
      saveCandidates: SAMPLE_FEEDBACK.save_candidates,
    };
    return result as T;
  }

  if (/\/sessions\/.+\/turns$/.test(path)) {
    const result: TurnResult = {
      turnId: "turn-1",
      turnIndex: 0,
      lowConfidence: false,
      feedback: SAMPLE_FEEDBACK,
      savedExpressionId: "exp-1",
      saveCandidates: SAMPLE_FEEDBACK.save_candidates,
    };
    return result as T;
  }

  if (/\/sessions\/.+\/finish$/.test(path)) {
    return SCORE_REPORT as T;
  }

  if (path === "/profile") {
    return PROFILE as T;
  }

  if (path === "/expressions" && method === "GET") {
    const type = req.query?.type as string | undefined;
    const rows = type
      ? mockExpressions.filter((e) => e.type === type)
      : mockExpressions;
    return rows as T;
  }

  if (path === "/expressions" && method === "POST") {
    const body = (req.body ?? {}) as Partial<Expression>;
    const row: Expression = {
      id: `exp-${exprSeq++}`,
      userId: "mock-user",
      type: (body.type as Expression["type"]) ?? "phrase",
      content: body.content ?? "",
      meaningCn: body.meaningCn ?? null,
      userOriginal: body.userOriginal ?? null,
      naturalExpression: body.naturalExpression ?? null,
      reviewStatus: { due: false },
      createdAt: new Date().toISOString(),
    };
    mockExpressions.unshift(row);
    return row as T;
  }

  if (/\/expressions\/.+/.test(path) && method === "DELETE") {
    const id = path.split("/").pop();
    const idx = mockExpressions.findIndex((e) => e.id === id);
    if (idx >= 0) mockExpressions.splice(idx, 1);
    return { deleted: true } as T;
  }

  throw new Error(`[mock] Unhandled ${method} ${path}`);
}
