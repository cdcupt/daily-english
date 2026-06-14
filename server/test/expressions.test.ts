import { describe, it, expect } from 'vitest';
import { defaultReviewStatus, mistakePairFromFeedback, parsePage } from '../src/expressions/service.js';
import type { FeedbackPayload } from '../src/db/schema.js';

const FB = (over: Partial<FeedbackPayload> = {}): FeedbackPayload => ({
  original: 'I want check in early.',
  corrected: "I'd like to check in early.",
  natural_version: 'Would it be possible to check in early?',
  issues: [{ type: 'grammar', explanation: "needs 'to'" }],
  save_candidates: ["I'd like to..."],
  ...over,
});

describe('defaultReviewStatus', () => {
  it('starts due-now with fresh SR state', () => {
    const now = new Date('2026-06-14T09:00:00Z');
    const rs = defaultReviewStatus(now);
    expect(rs.next_review_at).toBe(now.toISOString());
    expect(rs.mastery).toBe(0);
    expect(rs.ease).toBe(2.5);
    expect(rs.reps).toBe(0);
  });
});

describe('mistakePairFromFeedback', () => {
  it('builds a mistake_pair (original→corrected→natural)', () => {
    const p = mistakePairFromFeedback(FB(), { sourceSessionId: 's1', sourceScenarioId: 'sc1' });
    expect(p).not.toBeNull();
    expect(p!.type).toBe('mistake_pair');
    expect(p!.content).toContain("I'd like");
    expect(p!.userOriginal).toContain('want check in');
    expect(p!.naturalExpression).toContain('Would it be possible');
    expect(p!.sourceSessionId).toBe('s1');
  });

  it('returns null when the AI did not change anything (no mistake to save)', () => {
    const same = FB({ original: 'Hello there.', corrected: 'Hello there.' });
    expect(mistakePairFromFeedback(same)).toBeNull();
  });
});

describe('parsePage', () => {
  it('defaults to page 1, limit 20', () => expect(parsePage({})).toEqual({ page: 1, limit: 20 }));
  it('clamps limit to 100 and page to >=1', () => {
    expect(parsePage({ page: '0', limit: '500' })).toEqual({ page: 1, limit: 100 });
  });
  it('parses valid values', () => expect(parsePage({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10 }));
});
