// Best-effort, in-memory, per-instance rate limiting for the handful of
// intentionally public POST endpoints (currently just /api/demo-requests).
// This does NOT hold across Vercel serverless instances or cold starts —
// a distributed attacker or a fresh instance resets the count. It exists
// to stop a single script hammering the endpoint in a tight loop, not to
// withstand a determined attacker. If that becomes a real problem, replace
// this with a durable store (Upstash Redis, or a Postgres table) keyed the
// same way.
const hits = new Map<string, number[]>();
const MAX_TRACKED_KEYS = 5000; // bounds worst-case memory if abused from many IPs

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;
  const existing = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (existing.length >= limit) {
    hits.set(key, existing);
    return true;
  }

  existing.push(now);
  hits.set(key, existing);

  if (hits.size > MAX_TRACKED_KEYS) {
    const oldestKey = hits.keys().next().value;
    if (oldestKey !== undefined) hits.delete(oldestKey);
  }

  return false;
}

export function clientIp(req: Request): string {
  // Vercel sets x-forwarded-for on every request; take the first (client)
  // hop rather than trusting the whole chain.
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}
