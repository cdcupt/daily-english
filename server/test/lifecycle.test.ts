import { describe, it, expect } from 'vitest';
import { canTransition, allowedTransitions, isItemStatus, ITEM_STATUSES } from '../src/content/lifecycle.js';

describe('lifecycle state machine', () => {
  it('allows the happy path draft → … → published → monitored', () => {
    expect(canTransition('draft', 'generated')).toBe(true);
    expect(canTransition('generated', 'auto_checked')).toBe(true);
    expect(canTransition('auto_checked', 'review_pending')).toBe(true);
    expect(canTransition('review_pending', 'published')).toBe(true);
    expect(canTransition('published', 'monitored')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransition('draft', 'published')).toBe(false);
    expect(canTransition('draft', 'monitored')).toBe(false);
    expect(canTransition('published', 'draft')).toBe(false);
    expect(canTransition('archived', 'published')).toBe(false);
  });

  it('allows archiving from active states and reviving from archived', () => {
    for (const s of ['draft', 'generated', 'auto_checked', 'review_pending', 'published', 'monitored', 'improved'] as const) {
      expect(canTransition(s, 'archived')).toBe(true);
    }
    expect(canTransition('archived', 'draft')).toBe(true);
  });

  it('supports rejection back to draft for review', () => {
    expect(canTransition('review_pending', 'draft')).toBe(true);
    expect(canTransition('auto_checked', 'draft')).toBe(true);
  });

  it('isItemStatus guards unknown values', () => {
    expect(isItemStatus('published')).toBe(true);
    expect(isItemStatus('bogus')).toBe(false);
  });

  it('every status has a defined (possibly empty) transition list', () => {
    for (const s of ITEM_STATUSES) expect(Array.isArray(allowedTransitions(s))).toBe(true);
  });
});
