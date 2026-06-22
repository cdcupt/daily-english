import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Route-level test for the per-IP rate limit on POST /v1/study/topic (Fix 3).
 * The per-USER cap is bypassable because anonymous (deviceId) accounts are free
 * to mint, so we drive DIFFERENT users from the SAME IP and assert the per-IP
 * dimension (trustProxy → req.ip from X-Forwarded-For) trips on its own.
 *
 * The DB + AI are mocked so each MISS request "generates" successfully and
 * reaches the rate-limit charge; only the per-IP window should produce a 429.
 */

// --- Fake DB: every select returns []; inserts/updates resolve with stub rows so
// the generate→publish path completes without a real Postgres. ---
function chain(returningRows: unknown[]) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder['values'] = () => builder;
  builder['set'] = () => builder;
  builder['where'] = () => builder;
  builder['onConflictDoNothing'] = () => builder;
  builder['returning'] = () => Promise.resolve(returningRows);
  // A bare update/insert without .returning() is awaited directly.
  builder['then'] = (res: (v: unknown) => unknown) => res(undefined);
  void self;
  return builder;
}

const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({ limit: () => Promise.resolve([]) }),
        // cache lookup / by-id lookup → [] (MISS / not found)
        then: (res: (v: unknown) => unknown) => res([]),
      }),
    }),
  }),
  insert: (table: unknown) => {
    // practiceSessions / topicSessions / scenarios / contentSources all use
    // .returning(); hand back a row carrying the fields the route reads.
    const row = {
      id: `id-${Math.random().toString(36).slice(2)}`,
      slug: 'topic_x', status: 'generating', itemCount: 0, cefrBand: 'A2',
      mode: 'mixed', userId: 'u', state: 'active', topicKind: null,
    };
    void table;
    return chain([row]);
  },
  update: () => chain([]),
};

vi.mock('../src/db/client.js', () => ({ getDb: () => fakeDb, schema: {} }));

// Make scaffold + item generation deterministic and fast (no network / no AI).
vi.mock('../src/content/topic.js', async (orig) => {
  const actual = await orig<typeof import('../src/content/topic.js')>();
  return {
    ...actual,
    scaffoldTopic: async () => ({
      scaffold: {
        title: 'T', category: 'work', cefrBand: 'B1',
        userRole: 'U', aiRole: 'A', goal: 'G', onDomain: true, rejectReason: null,
      },
      promptVersion: 'topic.scaffold.v1',
    }),
  };
});

vi.mock('../src/content/generate.js', () => ({
  ITEM_GEN_PROMPT_VERSION: 'gen.item.v1',
  generateItem: async () => ({
    item: {
      prompt_cn: '我想要一杯咖啡。',
      reference_answers: ["I'd like a coffee, please."],
      target_phrases: ["I'd like..."],
      common_mistakes: [{ wrong: 'I want coffee', explanation: "needs 'a'" }],
      difficulty_score: 45,
    },
    raw: '{}', promptVersion: 'gen.item.v1',
  }),
}));

// Input + output moderation both pass.
vi.mock('../src/ai/moderation.js', () => ({
  MODERATION_URL: 'https://api.openai.com/v1/moderations',
  MODERATION_MODEL: 'omni-moderation-latest',
  ModerationError: class extends Error {},
  moderateText: async () => ({ flagged: false, categories: [] }),
}));

const { buildApp } = await import('../src/app.js');
const { resetTopicRateLimit } = await import('../src/routes/topics.js');
const { issueToken } = await import('../src/auth/tokens.js');

let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  resetTopicRateLimit();
  app = await buildApp();
});

async function postTopic(user: string, ip: string, topic: string) {
  return app.inject({
    method: 'POST',
    url: '/v1/study/topic',
    headers: {
      authorization: `Bearer ${issueToken(user, 'user', 'access')}`,
      'x-forwarded-for': ip,
      'content-type': 'application/json',
    },
    payload: { kind: 'custom', topic },
  });
}

describe('POST /v1/study/topic per-IP rate limit (Fix 3)', () => {
  it('429s by IP even when each request is a different (per-user-uncapped) account', async () => {
    const ip = '203.0.113.7';
    // Per-IP short cap is 10 / 10 min. Drive 10 distinct users (so the per-user
    // cap of 5 is never the cause) from the same IP, each on a unique topic
    // (each a cache MISS that charges the limiters).
    for (let i = 0; i < 10; i += 1) {
      const res = await postTopic(`user-${i}`, ip, `unique topic number ${i}`);
      expect(res.statusCode, `request ${i} body=${res.body}`).toBe(200);
    }
    // 11th request, a fresh user, same IP → blocked by the per-IP dimension.
    const blocked = await postTopic('user-11', ip, 'unique topic number eleven');
    expect(blocked.statusCode).toBe(429);
    expect(JSON.parse(blocked.body).error.code).toBe('rate_limited');

    // A different IP is unaffected (limit is per-IP, not global).
    const other = await postTopic('user-12', '203.0.113.99', 'unique topic number twelve');
    expect(other.statusCode).toBe(200);
  });

  it('429s by USER from a single IP once the per-user short cap (5) is exceeded', async () => {
    const ip = '198.51.100.4';
    // Same user, 5 unique-topic MISSes pass the per-user short window.
    for (let i = 0; i < 5; i += 1) {
      const res = await postTopic('solo', ip, `solo topic ${i}`);
      expect(res.statusCode, `request ${i} body=${res.body}`).toBe(200);
    }
    // 6th from the same user → per-user short window trips first.
    const blocked = await postTopic('solo', ip, 'solo topic six');
    expect(blocked.statusCode).toBe(429);
  });
});
