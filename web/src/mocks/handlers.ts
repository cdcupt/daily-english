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
  AdminItem,
  ItemStatus,
  GenerateResult,
  TransitionResult,
  RegenerateResult,
} from "@/api/types";

export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_API_MODE === "mock";
}

/**
 * Build a JWT-shaped mock token so `getRole()` can decode a role offline. In
 * mock mode the role defaults to `operator` (so /admin renders without a
 * backend); set NEXT_PUBLIC_MOCK_ROLE=user to preview the 404 gate.
 */
function mockToken(kind: "access" | "refresh"): string {
  const role =
    process.env.NEXT_PUBLIC_MOCK_ROLE === "user" ? "user" : "operator";
  const b64 = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const header = b64({ alg: "none", typ: "JWT" });
  const payload = b64({ sub: "mock-user", role, typ: kind });
  return `${header}.${payload}.mock`;
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

// Sample question bank spanning several lifecycle states + metric shapes.
let adminSeq = 200;
const mockAdminItems: AdminItem[] = [
  {
    id: "qi-1",
    itemKey: "coffee_shop_order_a2_001",
    type: "scenario_translation",
    status: "published",
    version: 3,
    cefrLevel: "A2",
    difficultyScore: 32,
    scenarioId: "scn-daily-coffee",
    metrics: { completionRate: 0.78, saveRate: 0.64, complaintRate: 0.01 },
  },
  {
    id: "qi-2",
    itemKey: "hotel_checkin_b1_003",
    type: "scenario_dialogue",
    status: "review_pending",
    version: 1,
    cefrLevel: "B1",
    difficultyScore: 54,
    scenarioId: "scn-travel-hotel",
    metrics: null,
  },
  {
    id: "qi-3",
    itemKey: "interview_intro_b2_002",
    type: "scenario_dialogue",
    status: "auto_checked",
    version: 1,
    cefrLevel: "B2",
    difficultyScore: 71,
    scenarioId: "scn-work-interview",
    metrics: null,
  },
  {
    id: "qi-4",
    itemKey: "return_refund_a2_004",
    type: "scenario_translation",
    status: "monitored",
    version: 2,
    cefrLevel: "A2",
    difficultyScore: 30,
    scenarioId: "scn-shop-refund",
    metrics: { completionRate: 0.41, saveRate: 0.22, complaintRate: 0.06 },
  },
  {
    id: "qi-5",
    itemKey: "small_talk_weather_a1_001",
    type: "topic_description",
    status: "draft",
    version: 1,
    cefrLevel: "A1",
    difficultyScore: 12,
    scenarioId: "scn-social-smalltalk",
    metrics: null,
  },
  {
    id: "qi-6",
    itemKey: "directions_metro_a2_009",
    type: "scenario_dialogue",
    status: "generated",
    version: 1,
    cefrLevel: "A2",
    difficultyScore: 28,
    scenarioId: "scn-daily-directions",
    metrics: null,
  },
  {
    id: "qi-7",
    itemKey: "old_directions_a2_007",
    type: "scenario_translation",
    status: "archived",
    version: 4,
    cefrLevel: "A2",
    difficultyScore: 33,
    scenarioId: "scn-daily-directions",
    metrics: { completionRate: 0.33, saveRate: 0.12, complaintRate: 0.09 },
  },
  {
    id: "qi-8",
    itemKey: "negotiate_price_b1_005",
    type: "scenario_dialogue",
    status: "improved",
    version: 5,
    cefrLevel: "B1",
    difficultyScore: 58,
    scenarioId: "scn-shop-negotiate",
    metrics: { completionRate: 0.69, saveRate: 0.5, complaintRate: 0.02 },
  },
];

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
      access: mockToken("access"),
      refresh: mockToken("refresh"),
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

  if (path === "/admin/items" && method === "GET") {
    return mockAdminItems as T;
  }

  if (/\/admin\/items\/.+\/transition$/.test(path) && method === "POST") {
    const id = path.split("/")[3];
    const to = (req.body as { to?: ItemStatus } | undefined)?.to ?? "draft";
    const item = mockAdminItems.find((i) => i.id === id);
    if (item) item.status = to;
    return { id, status: to } satisfies TransitionResult as T;
  }

  if (/\/admin\/items\/.+\/regenerate$/.test(path) && method === "POST") {
    const id = path.split("/")[3];
    const item = mockAdminItems.find((i) => i.id === id);
    if (item) {
      item.status = "draft";
      item.version += 1;
    }
    return {
      id,
      status: item?.status ?? "draft",
      version: item?.version ?? 1,
    } satisfies RegenerateResult as T;
  }

  if (path === "/admin/generate" && method === "POST") {
    const b = (req.body ?? {}) as {
      scenarioId?: string;
      type?: AdminItem["type"];
      cefrLevel?: string;
    };
    const row: AdminItem = {
      id: `qi-${adminSeq++}`,
      itemKey: `${(b.scenarioId ?? "scenario").replace(/^scn-/, "")}_${b.type ?? "scenario_translation"}_${Date.now()}`,
      type: b.type ?? "scenario_translation",
      status: "generated",
      version: 1,
      cefrLevel: b.cefrLevel ?? "A2",
      difficultyScore: null,
      scenarioId: b.scenarioId ?? "scn-unknown",
      metrics: null,
    };
    mockAdminItems.unshift(row);
    return {
      id: row.id,
      status: row.status,
      itemKey: row.itemKey,
    } satisfies GenerateResult as T;
  }

  throw new Error(`[mock] Unhandled ${method} ${path}`);
}
