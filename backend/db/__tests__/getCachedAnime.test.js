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
    it('returns anime ordered by first_air_date descending (newest release first)', async () => {
      await query(
        `INSERT INTO anime (id, tmdb_id, tmdb_type, title, genres, first_air_date, cached_at)
         VALUES
           (uuid_generate_v4(), 10161, 'tv', 'Oldest', '{}', '2020-01-01', NOW()),
           (uuid_generate_v4(), 10162, 'tv', 'Middle', '{}', '2022-01-01', NOW()),
           (uuid_generate_v4(), 10163, 'tv', 'Newest', '{}', '2024-01-01', NOW())`
      );

      const results = await getRecentlyCachedAnime(1000);

      const relevant = results.filter((r) => [10161, 10162, 10163].includes(r.tmdb_id));
      const titles = relevant.map((r) => r.title);

      expect(titles).toHaveLength(3);
      expect(titles[0]).toBe('Newest');
      expect(titles[1]).toBe('Middle');
      expect(titles[2]).toBe('Oldest');
    });

    it('sorts by release/air date, not by when the row was cached (mixed case)', async () => {
      // "Spirited Away" scenario: a title cached into the DB very recently
      // but released long ago should NOT outrank a title with a newer
      // release date that happened to be cached earlier.
      await query(
        `INSERT INTO anime (id, tmdb_id, tmdb_type, title, genres, first_air_date, cached_at)
         VALUES
           (uuid_generate_v4(), 10164, 'movie', 'Old Release, Cached Recently', '{}', '2001-07-20', NOW()),
           (uuid_generate_v4(), 10165, 'tv',    'New Release, Cached Long Ago', '{}', '2024-01-01', NOW() - INTERVAL '30 days')`
      );

      const results = await getRecentlyCachedAnime(1000);

      const relevant = results.filter((r) => [10164, 10165].includes(r.tmdb_id));
      expect(relevant[0].title).toBe('New Release, Cached Long Ago');
      expect(relevant[1].title).toBe('Old Release, Cached Recently');
    });

    it('sorts rows with a null first_air_date last', async () => {
      await query(
        `INSERT INTO anime (id, tmdb_id, tmdb_type, title, genres, first_air_date, cached_at)
         VALUES
           (uuid_generate_v4(), 10166, 'tv', 'Unknown Air Date', '{}', NULL, NOW()),
           (uuid_generate_v4(), 10167, 'tv', 'Has Air Date', '{}', '2019-01-01', NOW())`
      );

      const results = await getRecentlyCachedAnime(1000);

      const relevant = results.filter((r) => [10166, 10167].includes(r.tmdb_id));
      expect(relevant[0].title).toBe('Has Air Date');
      expect(relevant[1].title).toBe('Unknown Air Date');
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

      const results = await getRecentlyCachedAnime(1000);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('offset', () => {
    it('skips the first N rows when offset is provided', async () => {
      await query(
        `INSERT INTO anime (id, tmdb_id, tmdb_type, title, genres, first_air_date, cached_at)
         VALUES
           (uuid_generate_v4(), 10161, 'tv', 'Oldest', '{}', '2020-01-01', NOW()),
           (uuid_generate_v4(), 10162, 'tv', 'Middle', '{}', '2022-01-01', NOW()),
           (uuid_generate_v4(), 10163, 'tv', 'Newest', '{}', '2024-01-01', NOW())`
      );

      const firstPage = await getRecentlyCachedAnime(1, {}, 0);
      const secondPage = await getRecentlyCachedAnime(1, {}, 1);

      expect(firstPage[0].title).toBe('Newest');
      expect(secondPage[0].title).toBe('Middle');
    });

    it('defaults to offset 0 when omitted', async () => {
      await createTestAnime({ tmdbId: 10161 });

      const withDefault = await getRecentlyCachedAnime(1000);
      const withExplicitZero = await getRecentlyCachedAnime(1000, {}, 0);

      expect(withDefault.map((r) => r.id)).toEqual(withExplicitZero.map((r) => r.id));
    });

    it('returns an empty array when offset is beyond the result set', async () => {
      await createTestAnime({ tmdbId: 10161 });

      const results = await getRecentlyCachedAnime(1000, {}, 99999);
      expect(results).toEqual([]);
    });

    it('throws if offset is negative', async () => {
      await expect(getRecentlyCachedAnime(10, {}, -1)).rejects.toThrow();
    });

    it('throws if offset is not an integer', async () => {
      await expect(getRecentlyCachedAnime(10, {}, 1.5)).rejects.toThrow();
    });
  });

  describe('return shape', () => {
    it('returns all expected columns', async () => {
      await createTestAnime({ tmdbId: 10161 });

      // A large limit — these rows have no first_air_date (sorts last), so a
      // small limit could push them out depending on unrelated DB state.
      const results = await getRecentlyCachedAnime(1000);
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

      const results = await getRecentlyCachedAnime(1000, { season: 'winter' });

      expect(results.some((r) => r.tmdb_id === 10161)).toBe(true);
      expect(results.some((r) => r.tmdb_id === 10162)).toBe(false);
    });

    it('returns only anime matching the given year', async () => {
      await createTestAnime({ tmdbId: 10161, title: '2023 Show', firstAirDate: '2023-05-01' });
      await createTestAnime({ tmdbId: 10162, title: '2024 Show', firstAirDate: '2024-05-01' });

      const results = await getRecentlyCachedAnime(1000, { year: 2024 });

      expect(results.some((r) => r.tmdb_id === 10162)).toBe(true);
      expect(results.some((r) => r.tmdb_id === 10161)).toBe(false);
    });

    it('excludes anime with a null first_air_date when filtering by season', async () => {
      await createTestAnime({ tmdbId: 10161, firstAirDate: null });

      const results = await getRecentlyCachedAnime(1000, { season: 'winter' });
      expect(results.some((r) => r.tmdb_id === 10161)).toBe(false);
    });
  });

  describe('genre filter', () => {
    it('returns anime matching any of the given genres (OR match)', async () => {
      await createTestAnime({ tmdbId: 10161, title: 'Action Show', genres: ['Action & Adventure'] });
      await createTestAnime({ tmdbId: 10162, title: 'Drama Show', genres: ['Drama'] });

      // Large limit — these test rows have no first_air_date, so a small
      // limit is sensitive to unrelated dated rows elsewhere in the DB.
      const results = await getRecentlyCachedAnime(1000, { genres: ['Action & Adventure'] });

      expect(results.some((r) => r.tmdb_id === 10161)).toBe(true);
      expect(results.some((r) => r.tmdb_id === 10162)).toBe(false);
    });
  });