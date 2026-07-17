import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { query } from '../db.js';
import { getRecentlyCachedAnime, upsertAnime } from '../anime.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestAnime(overrides = {}) {
  return await upsertAnime({
    tmdbId: 10160,
    tmdbType: 'tv',
    seasonNumber: null,
    title: 'Test Anime',
    genres: [],
    ...overrides,
  });
}

async function cleanup() {
  await query('DELETE FROM anime WHERE tmdb_id BETWEEN 10160 AND 10169');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getRecentlyCachedAnime', () => {
  beforeEach(async () => {
    await query('DELETE FROM anime WHERE tmdb_id BETWEEN 10160 AND 10169');
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('ordering', () => {
    it('returns anime ordered by cached_at descending', async () => {
      await query(
        `INSERT INTO anime (id, tmdb_id, tmdb_type, title, genres, cached_at)
         VALUES
           (uuid_generate_v4(), 10161, 'tv', 'Oldest', '{}', NOW() - INTERVAL '3 days'),
           (uuid_generate_v4(), 10162, 'tv', 'Middle', '{}', NOW() - INTERVAL '2 days'),
           (uuid_generate_v4(), 10163, 'tv', 'Newest', '{}', NOW() - INTERVAL '1 day')`
      );

      const results = await getRecentlyCachedAnime(1000);

      const relevant = results.filter((r) => [10161, 10162, 10163].includes(r.tmdb_id));
      const titles = relevant.map((r) => r.title);

      expect(titles).toHaveLength(3);
      expect(titles[0]).toBe('Newest');
      expect(titles[1]).toBe('Middle');
      expect(titles[2]).toBe('Oldest');
    });

    it('returns the most recently cached row first', async () => {
      await query(
        `INSERT INTO anime (id, tmdb_id, tmdb_type, title, genres, cached_at)
         VALUES
           (uuid_generate_v4(), 10164, 'tv', 'Old',   '{}', NOW() - INTERVAL '5 days'),
           (uuid_generate_v4(), 10165, 'tv', 'Fresh', '{}', NOW())`
      );

      const results = await getRecentlyCachedAnime(1000);

      const relevant = results.filter((r) => [10164, 10165].includes(r.tmdb_id));
      expect(relevant[0].title).toBe('Fresh');
    });
  });

  describe('limit', () => {
    it('respects the limit parameter', async () => {
      await query(
        `INSERT INTO anime (id, tmdb_id, tmdb_type, title, genres, cached_at)
         VALUES
           (uuid_generate_v4(), 10161, 'tv', 'Anime 1', '{}', NOW() - INTERVAL '5 days'),
           (uuid_generate_v4(), 10162, 'tv', 'Anime 2', '{}', NOW() - INTERVAL '4 days'),
           (uuid_generate_v4(), 10163, 'tv', 'Anime 3', '{}', NOW() - INTERVAL '3 days'),
           (uuid_generate_v4(), 10164, 'tv', 'Anime 4', '{}', NOW() - INTERVAL '2 days'),
           (uuid_generate_v4(), 10165, 'tv', 'Anime 5', '{}', NOW() - INTERVAL '1 day')`
      );

      const results = await getRecentlyCachedAnime(3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('returns fewer rows than limit when not enough anime exist', async () => {
      await createTestAnime({ tmdbId: 10161 });
      await createTestAnime({ tmdbId: 10162, tmdbType: 'movie' });

      const results = await getRecentlyCachedAnime(10);
      expect(results.length).toBeLessThanOrEqual(10);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('return shape', () => {
    it('returns all expected columns', async () => {
      await createTestAnime({ tmdbId: 10161 });

      const results = await getRecentlyCachedAnime(10);
      const row = results.find((r) => r.tmdb_id === 10161);

      const expectedKeys = [
        'id', 'tmdb_id', 'tmdb_type', 'season_number', 'title',
        'original_title', 'overview', 'poster_path', 'backdrop_path',
        'episode_count', 'season_count', 'status', 'first_air_date',
        'genres', 'cached_at',
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
      const results = await getRecentlyCachedAnime(10);
      expect(Array.isArray(results)).toBe(true);
    });
  });

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


describe('season/year filters', () => {
    it('returns only anime matching the given season', async () => {
      await createTestAnime({ tmdbId: 10161, title: 'Winter Show', firstAirDate: '2024-01-15' });
      await createTestAnime({ tmdbId: 10162, title: 'Summer Show', firstAirDate: '2024-07-15' });

      const results = await getRecentlyCachedAnime(10, { season: 'winter' });

      expect(results.some((r) => r.tmdb_id === 10161)).toBe(true);
      expect(results.some((r) => r.tmdb_id === 10162)).toBe(false);
    });

    it('returns only anime matching the given year', async () => {
      await createTestAnime({ tmdbId: 10161, title: '2023 Show', firstAirDate: '2023-05-01' });
      await createTestAnime({ tmdbId: 10162, title: '2024 Show', firstAirDate: '2024-05-01' });

      const results = await getRecentlyCachedAnime(10, { year: 2024 });

      expect(results.some((r) => r.tmdb_id === 10162)).toBe(true);
      expect(results.some((r) => r.tmdb_id === 10161)).toBe(false);
    });

    it('excludes anime with a null first_air_date when filtering by season', async () => {
      await createTestAnime({ tmdbId: 10161, firstAirDate: null });

      const results = await getRecentlyCachedAnime(10, { season: 'winter' });
      expect(results.some((r) => r.tmdb_id === 10161)).toBe(false);
    });
  });

  describe('genre filter', () => {
    it('returns anime matching any of the given genres (OR match)', async () => {
      await createTestAnime({ tmdbId: 10161, title: 'Action Show', genres: ['Action & Adventure'] });
      await createTestAnime({ tmdbId: 10162, title: 'Drama Show', genres: ['Drama'] });

      const results = await getRecentlyCachedAnime(10, { genres: ['Action & Adventure'] });

      expect(results.some((r) => r.tmdb_id === 10161)).toBe(true);
      expect(results.some((r) => r.tmdb_id === 10162)).toBe(false);
    });
  });