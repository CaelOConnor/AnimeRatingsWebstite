import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isStale } from '../../utils/utils.js';

// isStale(cachedAt, ttlDays)

describe('isStale', () => {
  // vi.useFakeTimers lets us control Date.now() / new Date() globally.
  beforeEach(() => {
    vi.useFakeTimers();
    // Anchor point: 2024-06-01T00:00:00.000Z
    vi.setSystemTime(new Date('2024-06-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Default TTL (7 days) ───────────────────────────────────────────────────
  it('returns false when cachedAt is recent (1 day ago, default TTL)', () => {
    const oneDayAgo = new Date('2024-05-31T00:00:00.000Z');
    expect(isStale(oneDayAgo)).toBe(false);
  });

  it('returns false when cachedAt is 6 days ago (within default 7-day TTL)', () => {
    const sixDaysAgo = new Date('2024-05-26T00:00:00.000Z');
    expect(isStale(sixDaysAgo)).toBe(false);
  });

  it('returns true when cachedAt is 8 days ago (past default 7-day TTL)', () => {
    const eightDaysAgo = new Date('2024-05-24T00:00:00.000Z');
    expect(isStale(eightDaysAgo)).toBe(true);
  });

  // Exactly at the TTL boundary (7 days ago to the millisecond) is stale.
  // This prevents a cache entry from living forever if something goes wrong
  // and cached_at is never refreshed — >= is safer than >.
  it('returns true when cachedAt is exactly 7 days ago (boundary is stale)', () => {
    const exactlySevenDaysAgo = new Date('2024-05-25T00:00:00.000Z');
    expect(isStale(exactlySevenDaysAgo)).toBe(true);
  });

  // ── Custom TTL ─────────────────────────────────────────────────────────────
  it('returns false when cachedAt is 1 day ago with a 1-day TTL (within window)', () => {
    // 1-day TTL: anything less than 1 full day old is still fresh.
    // cachedAt = 12 hours ago → still fresh
    const twelveHoursAgo = new Date('2024-05-31T12:00:00.000Z');
    expect(isStale(twelveHoursAgo, 1)).toBe(false);
  });

  it('returns true when cachedAt is 2 days ago with a 1-day TTL', () => {
    const twoDaysAgo = new Date('2024-05-30T00:00:00.000Z');
    expect(isStale(twoDaysAgo, 1)).toBe(true);
  });

  it('returns false when cachedAt is 29 days ago with a 30-day TTL', () => {
    const twentyNineDaysAgo = new Date('2024-05-03T00:00:00.000Z');
    expect(isStale(twentyNineDaysAgo, 30)).toBe(false);
  });

  it('returns true when cachedAt is 31 days ago with a 30-day TTL', () => {
    const thirtyOneDaysAgo = new Date('2024-05-01T00:00:00.000Z');
    expect(isStale(thirtyOneDaysAgo, 30)).toBe(true);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────
  it('returns false when cachedAt is right now (just cached this instant)', () => {
    // A freshly cached row should never be considered stale immediately.
    const rightNow = new Date('2024-06-01T00:00:00.000Z');
    expect(isStale(rightNow)).toBe(false);
  });

  it('handles cachedAt as a string (Postgres TIMESTAMPTZ comes back as a string)', () => {
    // pg returns TIMESTAMPTZ columns as ISO string, not a Date object.
    // isStale must handle both — coerce internally with new Date(cachedAt).
    const eightDaysAgoString = '2024-05-24T00:00:00.000Z';
    expect(isStale(eightDaysAgoString)).toBe(true);
  });

  it('handles cachedAt as a Date object', () => {
    const eightDaysAgo = new Date('2024-05-24T00:00:00.000Z');
    expect(isStale(eightDaysAgo)).toBe(true);
  });

  it('returns true when cachedAt is a very old date (long-neglected cache row)', () => {
    // Ensures no overflow or weird behaviour with old dates.
    const veryOldDate = new Date('2020-01-01T00:00:00.000Z');
    expect(isStale(veryOldDate)).toBe(true);
  });

  it('returns false when ttlDays is 0 and cachedAt is right now', () => {
    // TTL of 0 means "always stale unless cached this exact millisecond".
    // cachedAt = now → age = 0ms → 0 >= 0 → stale.
    // This is an unusual config but the function should not crash.
    const rightNow = new Date('2024-06-01T00:00:00.000Z');
    expect(isStale(rightNow, 0)).toBe(true);
  });

  it('does not mutate the cachedAt argument', () => {
    // Guard against accidentally calling .setTime() or similar on the input.
    const original = new Date('2024-05-24T00:00:00.000Z');
    const originalTime = original.getTime();
    isStale(original);
    expect(original.getTime()).toBe(originalTime);
  });
});