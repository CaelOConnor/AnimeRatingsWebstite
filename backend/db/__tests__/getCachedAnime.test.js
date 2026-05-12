import { describe, it, expect, afterEach } from 'vitest';
import { query } from '../db.js';
import { getRecentlyCachedAnime, upsertAnime } from '../anime.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestAnime(overrides = {}) {
  return await upsertAnime({
    tmdbId: 99999,
    tmdbType: 'tv',
    seasonNumber: null,
    title: 'Test Anime',
    genres: [],
    ...overrides,
  });
}

async function cleanup() {
  await query('DELETE FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getRecentlyCachedAnime', () => {
  afterEach(async () => {
    await cleanup();
  });

  // -------------------------------------------------------------------------
  // Ordering
  // -------------------------------------------------------------------------

  describe('ordering', () => {
    it('returns anime ordered by cached_at descending', async () => {
      // Insert rows with explicit cached_at timestamps so ordering is deterministic
      await query(
        `INSERT INTO anime (id, tmdb_id, tmdb_type, title, genres, cached_at)
         VALUES
           (uuid_generate_v4(), 99991, 'tv', 'Oldest', '{}', NOW() - INTERVAL '3 days'),
           (uuid_generate_v4(), 99992, 'tv', 'Middle', '{}', NOW() - INTERVAL '2 days'),
           (uuid_generate_v4(), 99993, 'tv', 'Newest', '{}', NOW() - INTERVAL '1 day')`
      );

      const results = await getRecentlyCachedAnime(10);

      const titles = results
        .filter((r) => ['Oldest', 'Middle', 'Newest'].includes(r.title))
        .map((r) => r.title);

      expect(titles.indexOf('Newest')).toBeLessThan(titles.indexOf('Middle'));
      expect(titles.indexOf('Middle')).toBeLessThan(titles.indexOf('Oldest'));
    });

    it('returns the most recently cached row first', async () => {
      await query(
        `INSERT INTO anime (id, tmdb_id, tmdb_type, title, genres, cached_at)
         VALUES
           (uuid_generate_v4(), 99991, 'tv', 'Old',   '{}', NOW() - INTERVAL '5 days'),
           (uuid_generate_v4(), 99992, 'tv', 'Fresh', '{}', NOW())`
      );

      const results = await getRecentlyCachedAnime(10);

      const relevant = results.filter((r) => ['Old', 'Fresh'].includes(r.title));
      expect(relevant[0].title).toBe('Fresh');
    });
  });

  // -------------------------------------------------------------------------
  // Limit
  // -------------------------------------------------------------------------

  describe('limit', () => {
    it('respects the limit parameter', async () => {
      await query(
        `INSERT INTO anime (id, tmdb_id, tmdb_type, title, genres, cached_at)
         VALUES
           (uuid_generate_v4(), 99991, 'tv', 'Anime 1', '{}', NOW() - INTERVAL '5 days'),
           (uuid_generate_v4(), 99992, 'tv', 'Anime 2', '{}', NOW() - INTERVAL '4 days'),
           (uuid_generate_v4(), 99993, 'tv', 'Anime 3', '{}', NOW() - INTERVAL '3 days'),
           (uuid_generate_v4(), 99994, 'tv', 'Anime 4', '{}', NOW() - INTERVAL '2 days'),
           (uuid_generate_v4(), 99995, 'tv', 'Anime 5', '{}', NOW() - INTERVAL '1 day')`
      );

      const results = await getRecentlyCachedAnime(3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('returns fewer rows than limit when not enough anime exist', async () => {
      await createTestAnime({ tmdbId: 99991 });
      await createTestAnime({ tmdbId: 99992, tmdbType: 'movie' });

      const results = await getRecentlyCachedAnime(10);
      expect(results.length).toBeLessThanOrEqual(10);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Return shape
  // -------------------------------------------------------------------------

  describe('return shape', () => {
    it('returns all expected columns', async () => {
      await createTestAnime({ tmdbId: 99991 });

      const results = await getRecentlyCachedAnime(10);
      const row = results.find((r) => r.tmdb_id === 99991);

      const expectedKeys = [
        'id',
        'tmdb_id',
        'tmdb_type',
        'season_number',
        'title',
        'original_title',
        'overview',
        'poster_path',
        'backdrop_path',
        'episode_count',
        'season_count',
        'status',
        'first_air_date',
        'genres',
        'cached_at',
      ];

      for (const key of expectedKeys) {
        expect(row, `missing key: ${key}`).toHaveProperty(key);
      }
    });

    it('returns an array', async () => {
      const results = await getRecentlyCachedAnime(10);
      expect(Array.isArray(results)).toBe(true);
    });

    it('returns an empty array when no anime exist', async () => {
      // cleanup in afterEach ensures a clean slate
      const results = await getRecentlyCachedAnime(10);
      expect(results).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('throws if limit is missing', async () => {
      await expect(getRecentlyCachedAnime()).rejects.toThrow();
    });

    it('throws if limit is zero', async () => {
      await expect(getRecentlyCachedAnime(0)).rejects.toThrow();
    });

    it('throws if limit is negative', async () => {
      await expect(getRecentlyCachedAnime(-1)).rejects.toThrow();
    });
  });
});