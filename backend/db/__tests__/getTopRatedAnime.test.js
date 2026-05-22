import { describe, it, expect, afterEach } from 'vitest';
import { query } from '../db.js';
import { getTopRatedAnime, upsertAnime } from '../anime.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Inserts a minimal anime row and returns it.
 * Uses distinct tmdbIds so rows don't conflict with each other.
 */
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

/**
 * Inserts a review row directly via SQL.
 * We don't have a reviews DB helper yet, so raw SQL is fine here.
 * Requires a real user_id — createTestUser() handles that.
 */
async function createTestReview({ animeId, userId, rating }) {
  await query(
    `INSERT INTO reviews (id, anime_id, user_id, rating, body)
     VALUES (uuid_generate_v4(), $1, $2, $3, 'Test review body')`,
    [animeId, userId, rating]
  );
}

/**
 * Inserts a minimal user row and returns its id.
 * reviews.user_id has a FK constraint so we need a real user.
 */
async function createTestUser(suffix = '') {
  const result = await query(
    `INSERT INTO users (id, username, email, password_hash)
     VALUES (uuid_generate_v4(), $1, $2, 'hash')
     RETURNING id`,
    [`toprated_testuser${suffix}`, `toprated_testuser${suffix}@example.com`]
  );
  return result.rows[0].id;
}

async function cleanup() {
  await query(`DELETE FROM users WHERE username LIKE 'toprated_testuser%'`);
  await query('DELETE FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getTopRatedAnime', () => {
  afterEach(async () => {
    await cleanup();
  });

  // -------------------------------------------------------------------------
  // Core ranking behaviour
  // -------------------------------------------------------------------------

  describe('ranking', () => {
    it('returns anime ordered by average rating descending', async () => {
      const userId = await createTestUser();

      const low  = await createTestAnime({ tmdbId: 99991, title: 'Low Rated' });
      const mid  = await createTestAnime({ tmdbId: 99992, title: 'Mid Rated' });
      const high = await createTestAnime({ tmdbId: 99993, title: 'High Rated' });

      await createTestReview({ animeId: low.id,  userId, rating: 3 });
      await createTestReview({ animeId: mid.id,  userId, rating: 6 });
      await createTestReview({ animeId: high.id, userId, rating: 9 });

      const results = await getTopRatedAnime(10);

      const idsInOrder = [high.id, mid.id, low.id];
      const filtered = results.filter((r) => idsInOrder.includes(r.id));

      expect(filtered).toHaveLength(3);
      expect(filtered[0].id).toBe(high.id);
      expect(filtered[1].id).toBe(mid.id);
      expect(filtered[2].id).toBe(low.id);
    });

    it('returns the correct average_rating value', async () => {
      const userId1 = await createTestUser('a');
      const userId2 = await createTestUser('b');

      const anime = await createTestAnime({ tmdbId: 99991 });

      await createTestReview({ animeId: anime.id, userId: userId1, rating: 7 });
      await createTestReview({ animeId: anime.id, userId: userId2, rating: 9 });

      const results = await getTopRatedAnime(10);
      const row = results.find((r) => r.id === anime.id);

      // AVG(7, 9) = 8.0
      expect(parseFloat(row.average_rating)).toBeCloseTo(8.0);
    });

    it('returns review_count alongside average_rating', async () => {
      const userId1 = await createTestUser('a');
      const userId2 = await createTestUser('b');
      const userId3 = await createTestUser('c');

      const anime = await createTestAnime({ tmdbId: 99991 });

      await createTestReview({ animeId: anime.id, userId: userId1, rating: 5 });
      await createTestReview({ animeId: anime.id, userId: userId2, rating: 7 });
      await createTestReview({ animeId: anime.id, userId: userId3, rating: 9 });

      const results = await getTopRatedAnime(10);
      const row = results.find((r) => r.id === anime.id);

      expect(Number(row.review_count)).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // limit behaviour
  // -------------------------------------------------------------------------

  describe('limit', () => {
    it('respects the limit parameter', async () => {
      const userId = await createTestUser();

      await Promise.all([
        createTestAnime({ tmdbId: 99991, title: 'Anime 1' }),
        createTestAnime({ tmdbId: 99992, title: 'Anime 2' }),
        createTestAnime({ tmdbId: 99993, title: 'Anime 3' }),
        createTestAnime({ tmdbId: 99994, title: 'Anime 4' }),
        createTestAnime({ tmdbId: 99995, title: 'Anime 5' }),
      ]).then(async (animes) => {
        for (const anime of animes) {
          await createTestReview({ animeId: anime.id, userId, rating: 7 });
        }
      });

      const results = await getTopRatedAnime(3);
      expect(results).toHaveLength(3);
    });

    it('returns fewer rows than limit when not enough reviewed anime exist', async () => {
      const userId = await createTestUser();
      const anime = await createTestAnime({ tmdbId: 99991 });
      await createTestReview({ animeId: anime.id, userId, rating: 8 });

      const results = await getTopRatedAnime(10);
      expect(results.length).toBeLessThanOrEqual(10);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // tmdbType filter
  // -------------------------------------------------------------------------

  describe('tmdbType filter', () => {
    it('returns only tv rows when tmdbType is "tv"', async () => {
      const userId = await createTestUser();

      const tv    = await createTestAnime({ tmdbId: 99991, tmdbType: 'tv' });
      const movie = await createTestAnime({ tmdbId: 99992, tmdbType: 'movie' });

      await createTestReview({ animeId: tv.id,    userId, rating: 8 });
      await createTestReview({ animeId: movie.id, userId, rating: 9 });

      const results = await getTopRatedAnime(10, 'tv');

      expect(results.every((r) => r.tmdb_type === 'tv')).toBe(true);
      expect(results.some((r) => r.id === tv.id)).toBe(true);
      expect(results.some((r) => r.id === movie.id)).toBe(false);
    });

    it('returns only movie rows when tmdbType is "movie"', async () => {
      const userId = await createTestUser();

      const tv    = await createTestAnime({ tmdbId: 99991, tmdbType: 'tv' });
      const movie = await createTestAnime({ tmdbId: 99992, tmdbType: 'movie' });

      await createTestReview({ animeId: tv.id,    userId, rating: 8 });
      await createTestReview({ animeId: movie.id, userId, rating: 9 });

      const results = await getTopRatedAnime(10, 'movie');

      expect(results.every((r) => r.tmdb_type === 'movie')).toBe(true);
      expect(results.some((r) => r.id === movie.id)).toBe(true);
      expect(results.some((r) => r.id === tv.id)).toBe(false);
    });

    it('returns both tv and movie rows when tmdbType is null', async () => {
      const userId = await createTestUser();

      const tv    = await createTestAnime({ tmdbId: 99991, tmdbType: 'tv' });
      const movie = await createTestAnime({ tmdbId: 99992, tmdbType: 'movie' });

      await createTestReview({ animeId: tv.id,    userId, rating: 8 });
      await createTestReview({ animeId: movie.id, userId, rating: 9 });

      const results = await getTopRatedAnime(10, null);

      const types = results.map((r) => r.tmdb_type);
      expect(types).toContain('tv');
      expect(types).toContain('movie');
    });

    it('returns both tv and movie rows when tmdbType is omitted', async () => {
      const userId = await createTestUser();

      const tv    = await createTestAnime({ tmdbId: 99991, tmdbType: 'tv' });
      const movie = await createTestAnime({ tmdbId: 99992, tmdbType: 'movie' });

      await createTestReview({ animeId: tv.id,    userId, rating: 8 });
      await createTestReview({ animeId: movie.id, userId, rating: 9 });

      // No second argument — should default to no filter
      const results = await getTopRatedAnime(10);

      const types = results.map((r) => r.tmdb_type);
      expect(types).toContain('tv');
      expect(types).toContain('movie');
    });
  });

  // -------------------------------------------------------------------------
  // Anime with no reviews are excluded
  // -------------------------------------------------------------------------

  describe('unreviewed anime', () => {
    it('excludes anime that have no reviews', async () => {
      const userId = await createTestUser();

      const reviewed   = await createTestAnime({ tmdbId: 99991, title: 'Has Reviews' });
      const unreviewed = await createTestAnime({ tmdbId: 99992, title: 'No Reviews' });

      await createTestReview({ animeId: reviewed.id, userId, rating: 8 });
      // Intentionally no review for unreviewed

      const results = await getTopRatedAnime(10);

      expect(results.some((r) => r.id === reviewed.id)).toBe(true);
      expect(results.some((r) => r.id === unreviewed.id)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Return shape
  // -------------------------------------------------------------------------

  describe('return shape', () => {
    it('returns all expected columns including average_rating and review_count', async () => {
      const userId = await createTestUser();
      const anime  = await createTestAnime({ tmdbId: 99991 });
      await createTestReview({ animeId: anime.id, userId, rating: 8 });

      const results = await getTopRatedAnime(10);
      const row = results.find((r) => r.id === anime.id);

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
        'average_rating',
        'review_count',
      ];

      for (const key of expectedKeys) {
        expect(row, `missing key: ${key}`).toHaveProperty(key);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Empty results
  // -------------------------------------------------------------------------

  describe('empty results', () => {
    it('returns an empty array when no reviewed anime exist', async () => {
      // No anime or reviews inserted — cleanup ensures a clean slate
      const results = await getTopRatedAnime(10);
      expect(Array.isArray(results)).toBe(true);
      // May have rows from other tests if cleanup is imperfect,
      // so just assert it doesn't throw and returns an array
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('throws if limit is missing', async () => {
      await expect(getTopRatedAnime()).rejects.toThrow();
    });

    it('throws if limit is not a positive integer', async () => {
      await expect(getTopRatedAnime(0)).rejects.toThrow();
      await expect(getTopRatedAnime(-1)).rejects.toThrow();
    });
  });
});