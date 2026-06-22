/**
 * Generic in-memory fixed-window rate limiter (no new deps), generalized from
 * the per-IP OAuth limiter. Used to cap NEW custom-topic generations per user
 * (Topic Sessions) — cache hits are NOT counted. Two independent windows can be
 * combined (e.g. a short burst window + a daily cap).
 */
export interface WindowConfig { max: number; windowMs: number }

interface Bucket { count: number; resetAt: number }

export class FixedWindowLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly config: WindowConfig) {}

  /**
   * Record one hit for `key` and return true if it is now OVER budget for the
   * window. A fresh/expired window resets the count to 1 (never over on the
   * first hit unless max < 1).
   */
  hit(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.config.windowMs });
      return this.config.max < 1;
    }
    bucket.count += 1;
    return bucket.count > this.config.max;
  }

  /** Drop expired buckets so the map can't grow unbounded. */
  sweep(now = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }

  /** Test-only: clear all state. */
  reset(): void {
    this.buckets.clear();
  }
}

/**
 * Two-window limiter: a key is limited when EITHER window is over budget. Both
 * windows are charged on every allowed hit. Designed for "N per short window AND
 * M per day" caps.
 */
export class DualWindowLimiter {
  private readonly short: FixedWindowLimiter;
  private readonly long: FixedWindowLimiter;

  constructor(short: WindowConfig, long: WindowConfig) {
    this.short = new FixedWindowLimiter(short);
    this.long = new FixedWindowLimiter(long);
  }

  /** True when this key is now over budget on either window. Charges both. */
  isLimited(key: string, now = Date.now()): boolean {
    const overShort = this.short.hit(key, now);
    const overLong = this.long.hit(key, now);
    return overShort || overLong;
  }

  sweep(now = Date.now()): void {
    this.short.sweep(now);
    this.long.sweep(now);
  }

  reset(): void {
    this.short.reset();
    this.long.reset();
  }
}
