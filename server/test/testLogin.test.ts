import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * POST /v1/auth/test-login — secret-gated E2E session minting.
 *
 * The success/idempotent cases exercise the real OAuth upsert/link transaction
 * (resolveIdentity), so we stand up a small STATEFUL in-memory fake of
 * db/client.js (no live Postgres in CI, matching topics*.test.ts). The fake
 * implements just the operations resolveIdentity touches: select by
 * providerSub / email / id, insert users / ability profiles / identities (with
 * onConflictDoNothing + returning), all inside db.transaction(cb).
 */

import { randomUUID } from 'node:crypto';
import { users, oauthIdentities } from '../src/db/schema.js';

// ---------- Minimal stateful in-memory DB keyed by the real table objects ----------
interface UserRow {
  id: string; deviceId: string; email: string | null; emailVerified: boolean;
  mergedInto: string | null; isOperator: boolean; tokenVersion: number; nativeLanguage: string;
}
interface IdentityRow { id: string; userId: string; provider: string; providerSub: string; email: string | null }

const store = {
  users: [] as UserRow[],
  identities: [] as IdentityRow[],
  abilityProfiles: [] as { userId: string }[],
};

function resetStore(): void {
  store.users = [];
  store.identities = [];
  store.abilityProfiles = [];
}

// Capture the column/value a `.where(eq(col, val))` targets. drizzle's eq()
// returns an opaque SQL object, so we stub eq() (see vi.mock below) to a plain
// { col, val } tag the fake can read.
type WhereTag = { col: unknown; val: unknown } | undefined;

function selectFrom(table: unknown, where: WhereTag): unknown[] {
  if (table === users) {
    let rows = store.users;
    if (where) {
      if (where.col === users.email) rows = rows.filter((r) => r.email === where.val);
      else if (where.col === users.id) rows = rows.filter((r) => r.id === where.val);
    }
    return rows.map((r) => ({ ...r }));
  }
  if (table === oauthIdentities) {
    let rows = store.identities;
    if (where) {
      if (where.col === oauthIdentities.providerSub) rows = rows.filter((r) => r.providerSub === where.val);
    }
    return rows.map((r) => ({ ...r }));
  }
  return [];
}

function makeSelect(table: unknown) {
  return {
    from: (_t: unknown) => ({
      where: (w: WhereTag) => Promise.resolve(selectFrom(table, w)),
    }),
  };
}

function makeInsert(table: unknown) {
  let pending: Record<string, unknown> = {};
  let conflictTargets: unknown[] | null = null;
  const builder = {
    values(v: Record<string, unknown>) { pending = v; return builder; },
    onConflictDoNothing(opts?: { target?: unknown }) {
      conflictTargets = opts?.target ? (Array.isArray(opts.target) ? opts.target : [opts.target]) : [];
      return builder;
    },
    returning() {
      if (table === users) {
        const row: UserRow = {
          id: randomUUID(),
          deviceId: (pending['deviceId'] as string) ?? randomUUID(),
          email: (pending['email'] as string) ?? null,
          emailVerified: Boolean(pending['emailVerified']),
          mergedInto: null, isOperator: false, tokenVersion: 0, nativeLanguage: 'zh',
        };
        store.users.push(row);
        return Promise.resolve([{ ...row }]);
      }
      if (table === oauthIdentities) {
        const provider = pending['provider'] as string;
        const providerSub = pending['providerSub'] as string;
        // Unique (provider, providerSub): onConflictDoNothing → 0 rows on dup.
        const exists = store.identities.some((r) => r.provider === provider && r.providerSub === providerSub);
        if (exists && conflictTargets) return Promise.resolve([]);
        const row: IdentityRow = {
          id: randomUUID(), userId: pending['userId'] as string,
          provider, providerSub, email: (pending['email'] as string) ?? null,
        };
        store.identities.push(row);
        return Promise.resolve([{ ...row }]);
      }
      return Promise.resolve([]);
    },
    // ability-profile insert is awaited without .returning()
    then(res: (v: unknown) => unknown) {
      if (table === oauthIdentities || table === users) return res(undefined);
      // userAbilityProfiles
      store.abilityProfiles.push({ userId: pending['userId'] as string });
      return res(undefined);
    },
  };
  return builder;
}

const fakeDb = {
  select: () => makeSelect(undefined as unknown),
  // resolveIdentity always calls .select().from(table) — we need the table to
  // pick the right store, so re-route through from() that captures the table.
  insert: (table: unknown) => makeInsert(table),
  update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
  transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx),
};

// tx must resolve the table at .from()/.insert() time. select().from(table) →
// pick store by table; insert(table) → makeInsert(table).
const fakeTx = {
  select: () => ({
    from: (table: unknown) => ({
      where: (w: WhereTag) => Promise.resolve(selectFrom(table, w)),
    }),
  }),
  insert: (table: unknown) => makeInsert(table),
  update: (_table: unknown) => ({
    set: (_v: unknown) => ({ where: (_w: WhereTag) => ({ returning: () => Promise.resolve([]) }) }),
  }),
};

vi.mock('../src/db/client.js', () => ({ getDb: () => fakeDb, schema: {} }));

// Stub drizzle's eq() to a readable { col, val } tag (the fake reads it).
vi.mock('drizzle-orm', async (orig) => {
  const actual = await orig<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: (col: unknown, val: unknown) => ({ col, val }),
    and: (...parts: unknown[]) => parts.find((p) => p) ?? parts[0],
  };
});

const { buildApp } = await import('../src/app.js');
const { resetRateLimit } = await import('../src/routes/oauth.js');
const { verifyToken } = await import('../src/auth/tokens.js');

const SECRET = 'super-secret-e2e-value-0123456789-abcdef'; // >= 32 chars (min enforced)

let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  resetStore();
  resetRateLimit();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  delete process.env['TEST_LOGIN_SECRET'];
});

function post(payload: unknown, ip = '203.0.113.10') {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/test-login',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    payload: payload as object,
  });
}

describe('POST /v1/auth/test-login', () => {
  it('404s when TEST_LOGIN_SECRET is unset (disabled by default, existence hidden)', async () => {
    delete process.env['TEST_LOGIN_SECRET'];
    const res = await post({ secret: 'anything' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('404s when TEST_LOGIN_SECRET is set but too short (weak secret refused)', async () => {
    process.env['TEST_LOGIN_SECRET'] = 'short';
    const res = await post({ secret: 'short' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('401s on a wrong secret (constant-time compare)', async () => {
    process.env['TEST_LOGIN_SECRET'] = SECRET;
    const res = await post({ secret: 'definitely-wrong' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_secret');
  });

  it('400s on a non-test-domain email (cannot mint for a real address)', async () => {
    process.env['TEST_LOGIN_SECRET'] = SECRET;
    const res = await post({ secret: SECRET, email: 'victim@gmail.com' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_test_email');
    // Nothing was created for the real address.
    expect(store.users).toHaveLength(0);
    expect(store.identities).toHaveLength(0);
  });

  it('also rejects a lookalike domain (dailingo.test must be the suffix)', async () => {
    process.env['TEST_LOGIN_SECRET'] = SECRET;
    const res = await post({ secret: SECRET, email: 'a@dailingo.test.evil.com' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_test_email');
  });

  it('200s and returns a decodable, linked JWT for provider "test" (default email)', async () => {
    process.env['TEST_LOGIN_SECRET'] = SECRET;
    const res = await post({ secret: SECRET });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json().data;

    expect(body.provider).toBe('test');
    expect(body.email).toBe('e2e@dailingo.test');
    expect(body.emailVerified).toBe(true);
    expect(typeof body.userId).toBe('string');
    expect(typeof body.deviceId).toBe('string');
    // First time → fresh account → outcome 'attached' (OAuth LinkOutcome convention).
    expect(body.linked).toBe('attached');

    // The access token decodes and points at the same user.
    const claims = verifyToken(body.access, 'access');
    expect(claims.sub).toBe(body.userId);
    expect(claims.role).toBe('user');
    verifyToken(body.refresh, 'refresh'); // refresh decodes too

    // Synthetic identity landed in the 'test' namespace, provider_sub = email.
    expect(store.identities).toHaveLength(1);
    expect(store.identities[0]!.provider).toBe('test');
    expect(store.identities[0]!.providerSub).toBe('e2e@dailingo.test');
  });

  it('is idempotent on repeat: same user, sign-in outcome the second time', async () => {
    process.env['TEST_LOGIN_SECRET'] = SECRET;
    const first = await post({ secret: SECRET, email: 'runner@dailingo.test' });
    expect(first.statusCode, first.body).toBe(200);
    const second = await post({ secret: SECRET, email: 'runner@dailingo.test' });
    expect(second.statusCode, second.body).toBe(200);

    expect(second.json().data.userId).toBe(first.json().data.userId);
    // No duplicate user / identity rows were created.
    expect(store.users).toHaveLength(1);
    expect(store.identities).toHaveLength(1);
    // Second call signs in to the existing identity (outcome 'login').
    expect(second.json().data.linked).toBe('login');
  });

  it('accepts a custom test-domain email and a sub-domain', async () => {
    process.env['TEST_LOGIN_SECRET'] = SECRET;
    const res = await post({ secret: SECRET, email: 'qa@ci.dailingo.test' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data.email).toBe('qa@ci.dailingo.test');
  });

  it('400s on a missing/invalid body before checking the secret', async () => {
    process.env['TEST_LOGIN_SECRET'] = SECRET;
    const res = await post({});
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('bad_request');
  });
});
