/**
 * In-memory, per-instance rate limiting. Not a security boundary — it is a
 * spend boundary, and it is honest about being one.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 6;

const hits = new Map<string, number[]>();

export function rateLimit(
  key: string,
  now: number,
): { ok: boolean; retryAfterSeconds: number } {
  const recent = (hits.get(key) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    const oldest = recent[0] ?? now;
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
    };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfterSeconds: 0 };
}

export function resetRateLimit(): void {
  hits.clear();
}
