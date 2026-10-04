/**
 * CampusFlow API - In-Memory Sliding Window Rate Limiter
 * Provides high-performance, non-blocking rate limiting for sensitive endpoints
 * (such as check-in token generation) with zero external network dependencies.
 */

class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Unref timer so it does not keep node process alive in tests or CLI scripts
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 60000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Evaluates if an action on `key` exceeds `limit` within `windowMs`.
   * Returns true if rate limit is exceeded, false otherwise.
   */
  public isRateLimited(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const threshold = now - windowMs;

    let timestamps = this.hits.get(key);
    if (!timestamps) {
      timestamps = [];
      this.hits.set(key, timestamps);
    }

    // Filter out expired timestamps
    const validTimestamps = timestamps.filter((t) => t > threshold);

    if (validTimestamps.length >= limit) {
      this.hits.set(key, validTimestamps);
      return true;
    }

    validTimestamps.push(now);
    this.hits.set(key, validTimestamps);
    return false;
  }

  /**
   * Cleans up stale keys to prevent memory leaks.
   */
  public cleanup(maxAgeMs = 120000): void {
    const threshold = Date.now() - maxAgeMs;
    for (const [key, timestamps] of this.hits.entries()) {
      const remaining = timestamps.filter((t) => t > threshold);
      if (remaining.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, remaining);
      }
    }
  }

  /**
   * Resets rate limit records (useful for test isolation).
   */
  public reset(key?: string): void {
    if (key) {
      this.hits.delete(key);
    } else {
      this.hits.clear();
    }
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.hits.clear();
  }
}

export const tokenRateLimiter = new SlidingWindowRateLimiter();
