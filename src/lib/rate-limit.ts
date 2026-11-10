/**
 * Sliding-window rate limit per client, kept in memory.
 *
 * The demo runs on a free API key with a small daily quota, and the chat
 * endpoint is public. Without a limit, one visitor (or a bot) could use up the
 * day's quota for everyone. In-memory state resets when the server restarts
 * and is per instance; a production app would keep it in Redis or similar.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();

  return function check(key: string, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
    const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return { allowed: false, retryAfterMs: windowMs - (now - recent[0]!) };
    }
    recent.push(now);
    hits.set(key, recent);
    return { allowed: true, retryAfterMs: 0 };
  };
}
