// isStale(cachedAt, ttlDays?)
//
// Returns true if the given timestamp is older than ttlDays (default 7).
// Boundary: exactly at the TTL is considered stale (age >= ttl, not age > ttl).
//
// @param {Date|string} cachedAt  - The cached_at value from the DB row.
//                                  Accepts a Date object or an ISO string,
//                                  since pg returns TIMESTAMPTZ as a string.
// @param {number}      ttlDays   - How many days before a cache entry is stale.
//                                  Defaults to 7.
// @returns {boolean}
export function isStale(cachedAt, ttlDays = 7) {
  const cachedAtMs = new Date(cachedAt).getTime(); // handles both string and Date
  const ttlMs      = ttlDays * 24 * 60 * 60 * 1000;
  const ageMs      = Date.now() - cachedAtMs;

  return ageMs >= ttlMs;
}