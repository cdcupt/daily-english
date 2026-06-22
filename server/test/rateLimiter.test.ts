import { describe, it, expect } from 'vitest';
import { FixedWindowLimiter, DualWindowLimiter } from '../src/util/rateLimiter.js';

describe('FixedWindowLimiter', () => {
  it('allows up to max then limits within a window', () => {
    const lim = new FixedWindowLimiter({ max: 3, windowMs: 1000 });
    const t = 1_000_000;
    expect(lim.hit('u', t)).toBe(false); // 1
    expect(lim.hit('u', t)).toBe(false); // 2
    expect(lim.hit('u', t)).toBe(false); // 3
    expect(lim.hit('u', t)).toBe(true);  // 4 → over
  });

  it('resets after the window elapses', () => {
    const lim = new FixedWindowLimiter({ max: 1, windowMs: 1000 });
    const t = 1_000_000;
    expect(lim.hit('u', t)).toBe(false);
    expect(lim.hit('u', t)).toBe(true);            // over in-window
    expect(lim.hit('u', t + 1001)).toBe(false);    // new window → allowed
  });

  it('tracks keys independently', () => {
    const lim = new FixedWindowLimiter({ max: 1, windowMs: 1000 });
    const t = 1_000_000;
    expect(lim.hit('a', t)).toBe(false);
    expect(lim.hit('b', t)).toBe(false); // different key, own budget
    expect(lim.hit('a', t)).toBe(true);
  });

  it('sweep drops expired buckets', () => {
    const lim = new FixedWindowLimiter({ max: 1, windowMs: 1000 });
    const t = 1_000_000;
    lim.hit('a', t);
    lim.sweep(t + 2000);
    expect(lim.hit('a', t + 2001)).toBe(false); // fresh window after sweep
  });
});

describe('DualWindowLimiter (short burst AND daily cap)', () => {
  it('limits when the short window is exceeded even if the long one is fine', () => {
    const lim = new DualWindowLimiter({ max: 5, windowMs: 10 * 60_000 }, { max: 30, windowMs: 24 * 60 * 60_000 });
    const t = 1_000_000;
    for (let i = 0; i < 5; i += 1) expect(lim.isLimited('u', t)).toBe(false);
    expect(lim.isLimited('u', t)).toBe(true); // 6th in 10 min → over short
  });

  it('limits when the daily cap is hit across multiple short windows', () => {
    const lim = new DualWindowLimiter({ max: 5, windowMs: 10 * 60_000 }, { max: 30, windowMs: 24 * 60 * 60_000 });
    let t = 1_000_000;
    let limited = false;
    // 6 short windows × 5 = 30 hits, then 1 more should trip the daily cap.
    for (let w = 0; w < 6; w += 1) {
      for (let i = 0; i < 5; i += 1) {
        limited = lim.isLimited('u', t);
      }
      t += 11 * 60_000; // jump past the short window so it resets each round
    }
    expect(limited).toBe(false); // exactly 30 allowed
    expect(lim.isLimited('u', t)).toBe(true); // 31st → over daily
  });

  it('does NOT charge the long window while the short window is over (check-then-charge)', () => {
    // Short cap 2, daily cap 100. After tripping the short window, retry-hammering
    // must NOT erode the daily budget: the long window should only ever see the 2
    // hits that passed the short window, never the over-budget retries.
    const lim = new DualWindowLimiter({ max: 2, windowMs: 10 * 60_000 }, { max: 100, windowMs: 24 * 60 * 60_000 });
    const t = 1_000_000;
    expect(lim.isLimited('u', t)).toBe(false); // 1 (short 1, long 1)
    expect(lim.isLimited('u', t)).toBe(false); // 2 (short 2, long 2)
    // Hammer the same window 50 times while over the short cap.
    for (let i = 0; i < 50; i += 1) expect(lim.isLimited('u', t)).toBe(true);

    // After the short window resets, the long window has only been charged twice,
    // so we should get (100 - 2) = 98 more allowed hits before the daily cap.
    let t2 = t + 11 * 60_000;
    let allowed = 0;
    for (let w = 0; w < 60; w += 1) {
      // Per short window only 2 pass; spread across windows to isolate the long cap.
      for (let i = 0; i < 2; i += 1) {
        if (!lim.isLimited('u', t2)) allowed += 1;
      }
      t2 += 11 * 60_000;
    }
    // 2 (initial) + 98 (remaining daily budget) = 100 total allowed; the hammering
    // never counted toward the daily cap.
    expect(allowed).toBe(98);
  });
});
