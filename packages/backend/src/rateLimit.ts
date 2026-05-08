interface Bucket {
  tokens: number;
  updated: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(private perMinute: number) {}

  /** Returns true if the action is allowed; consumes one token if so. */
  allow(key: string): boolean {
    const cap = this.perMinute;
    const refillPerMs = cap / 60_000;
    const t = Date.now();
    const b = this.buckets.get(key) ?? { tokens: cap, updated: t };
    const delta = t - b.updated;
    b.tokens = Math.min(cap, b.tokens + delta * refillPerMs);
    b.updated = t;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    return true;
  }

  reset(key: string) {
    this.buckets.delete(key);
  }
}
