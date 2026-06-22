import { describe, it, expect, vi, afterEach } from 'vitest';
import { moderateText, ModerationError, MODERATION_URL, MODERATION_MODEL } from '../src/ai/moderation.js';

// OPENAI_API_KEY is set in test/setup.ts (before src/env.ts evaluates) so the
// moderation module has a configured key; all network is mocked below.

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(((input: unknown, init?: RequestInit) =>
    Promise.resolve(impl(String(input), init ?? {}))) as typeof fetch);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => vi.restoreAllMocks());

describe('moderateText', () => {
  it('hits the OFFICIAL OpenAI moderations endpoint with omni-moderation-latest', async () => {
    const spy = mockFetch((url) => {
      expect(url).toBe(MODERATION_URL);
      expect(url.startsWith('https://api.openai.com/')).toBe(true);
      return jsonResponse({ results: [{ flagged: false, categories: {} }] });
    });
    await moderateText('ordering coffee');
    const body = JSON.parse(String((spy.mock.calls[0]![1] as RequestInit).body));
    expect(body.model).toBe(MODERATION_MODEL);
    expect(body.input).toBe('ordering coffee');
  });

  it('returns flagged=false with no categories for clean text', async () => {
    mockFetch(() => jsonResponse({ results: [{ flagged: false, categories: { violence: false } }] }));
    const r = await moderateText('job interview');
    expect(r.flagged).toBe(false);
    expect(r.categories).toEqual([]);
  });

  it('returns flagged=true with the triggered categories', async () => {
    mockFetch(() => jsonResponse({ results: [{ flagged: true, categories: { violence: true, hate: false, sexual: true } }] }));
    const r = await moderateText('bad stuff');
    expect(r.flagged).toBe(true);
    expect(r.categories.sort()).toEqual(['sexual', 'violence']);
  });

  it('THROWS on a non-OK HTTP status (caller fails closed)', async () => {
    mockFetch(() => new Response('rate limited', { status: 429 }));
    await expect(moderateText('x')).rejects.toBeInstanceOf(ModerationError);
  });

  it('THROWS on a network failure (caller fails closed)', async () => {
    mockFetch(() => { throw new TypeError('fetch failed'); });
    await expect(moderateText('x')).rejects.toBeInstanceOf(ModerationError);
  });

  it('THROWS on a malformed response (no results)', async () => {
    mockFetch(() => jsonResponse({ results: [] }));
    await expect(moderateText('x')).rejects.toBeInstanceOf(ModerationError);
  });
});
