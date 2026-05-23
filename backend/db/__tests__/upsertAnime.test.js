import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { query } from '../db.js';
import { upsertAnime } from '../anime.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal valid anime payload. Override individual fields per-test.
 * season_number omitted intentionally — defaults to null (whole series).
 */
function makeAnimeData(overrides = {}) {
  return {
    tmdbId: 1399,
    tmdbType: 'tv',
    seasonNumber: null,
    title: 'Game of Thrones',
    originalTitle: 'Game of Thrones',
    overview: 'Seven noble families fight for control of Mythical Westeros.',
    posterPath: '/path/to/poster.jpg',
    backdropPath: '/path/to/backdrop.jpg',
    episodeCount: 73,
    seasonCount: 8,
    status: 'Ended',
    firstAirDate: '2011-04-17',
    genres: ['Drama', 'Fantasy'],
    ...overrides,
  };
}

/** Hard-delete all rows inserted during a test by tmdbId. */
async function cleanupByTmdbId(tmdbId) {
  await query('DELETE FROM anime WHERE tmdb_id = $1', [tmdbId]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('upsertAnime', () => {
  beforeEach(async () => {
  await cleanupByTmdbId(1399);
  await cleanupByTmdbId(1400);
  await cleanupByTmdbId(1401);
  await cleanupByTmdbId(9999);
});

  // -------------------------------------------------------------------------
  // Basic insert
  // -------------------------------------------------------------------------

  describe('basic insert', () => {
    it('inserts a new row and returns the full anime object', async () => {
      const data = makeAnimeData();
      const result = await upsertAnime(data);

      expect(result).not.toBeNull();
      expect(result.tmdb_id).toBe(1399);
      expect(result.tmdb_type).toBe('tv');
      expect(result.season_number).toBeNull();
      expect(result.title).toBe('Game of Thrones');
      expect(result.episode_count).toBe(73);
      expect(result.season_count).toBe(8);
      expect(result.genres).toEqual(['Drama', 'Fantasy']);
      expect(result.id).toBeDefined();      // UUID assigned by DB
      expect(result.cached_at).toBeDefined();
    });

    it('inserts a movie row (tmdbType = movie)', async () => {
      const data = makeAnimeData({
        tmdbId: 1400,
        tmdbType: 'movie',
        title: 'Spirited Away',
        seasonNumber: null,
        seasonCount: null,
        episodeCount: null,
      });

      const result = await upsertAnime(data);

      expect(result.tmdb_type).toBe('movie');
      expect(result.tmdb_id).toBe(1400);
      expect(result.title).toBe('Spirited Away');
    });

    it('inserts a season-specific row (seasonNumber = 1)', async () => {
      const data = makeAnimeData({
        tmdbId: 1401,
        seasonNumber: 1,
        title: 'Game of Thrones Season 1',
        episodeCount: 10,
        seasonCount: null,
      });

      const result = await upsertAnime(data);

      expect(result.season_number).toBe(1);
      expect(result.tmdb_id).toBe(1401);
    });
  });

  // -------------------------------------------------------------------------
  // Upsert / conflict behaviour
  // -------------------------------------------------------------------------

  describe('upsert on conflict', () => {
    it('updates an existing row when (tmdbId, tmdbType, seasonNumber) conflicts', async () => {
      // First insert
      await upsertAnime(makeAnimeData({ title: 'Original Title' }));

      // Second upsert — same identifiers, different title
      const updated = await upsertAnime(makeAnimeData({ title: 'Updated Title' }));

      expect(updated.title).toBe('Updated Title');

      // Confirm only one row exists — no duplicate was created
      const { rows } = await query(
        'SELECT * FROM anime WHERE tmdb_id = $1 AND tmdb_type = $2 AND season_number IS NULL',
        [1399, 'tv']
      );
      expect(rows).toHaveLength(1);
    });

    it('refreshes cached_at on every upsert', async () => {
      const first = await upsertAnime(makeAnimeData());

      // Small delay so the timestamps are meaningfully different
      await new Promise((r) => setTimeout(r, 50));

      const second = await upsertAnime(makeAnimeData({ title: 'Any Change' }));

      const firstTime = new Date(first.cached_at).getTime();
      const secondTime = new Date(second.cached_at).getTime();

      expect(secondTime).toBeGreaterThan(firstTime);
    });

    it('preserves the original UUID id across an upsert', async () => {
      const first = await upsertAnime(makeAnimeData());
      const second = await upsertAnime(makeAnimeData({ title: 'Updated' }));

      expect(second.id).toBe(first.id);
    });

    it('treats same tmdbId with different tmdbType as separate rows', async () => {
      await upsertAnime(makeAnimeData({ tmdbType: 'tv' }));
      await upsertAnime(makeAnimeData({ tmdbType: 'movie' }));

      const { rows } = await query(
        'SELECT * FROM anime WHERE tmdb_id = $1',
        [1399]
      );
      expect(rows).toHaveLength(2);
    });

    it('treats same tmdbId with different seasonNumber as separate rows', async () => {
      await upsertAnime(makeAnimeData({ seasonNumber: null }));  // whole series
      await upsertAnime(makeAnimeData({ seasonNumber: 1 }));     // season 1
      await upsertAnime(makeAnimeData({ seasonNumber: 2 }));     // season 2

      const { rows } = await query(
        'SELECT * FROM anime WHERE tmdb_id = $1',
        [1399]
      );
      expect(rows).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // NULL season_number edge cases
  // These are the trickiest cases — Postgres UNIQUE indexes treat
  // NULL as distinct from every other NULL, so two whole-series rows
  // for the same tmdbId would NOT conflict at the DB level.
  // upsertAnime must handle this in application logic.
  // -------------------------------------------------------------------------

  describe('NULL season_number conflict (whole-series rows)', () => {
    it('does not create a duplicate whole-series row on repeated upsert', async () => {
      await upsertAnime(makeAnimeData({ seasonNumber: null }));
      await upsertAnime(makeAnimeData({ seasonNumber: null, title: 'Second Call' }));

      const { rows } = await query(
        'SELECT * FROM anime WHERE tmdb_id = $1 AND season_number IS NULL',
        [1399]
      );
      expect(rows).toHaveLength(1);
    });

    it('updates the title when upserting a whole-series row that already exists', async () => {
      await upsertAnime(makeAnimeData({ seasonNumber: null, title: 'First' }));
      const result = await upsertAnime(makeAnimeData({ seasonNumber: null, title: 'Second' }));

      expect(result.title).toBe('Second');
    });

    it('does not affect a season-specific row when upserting the whole-series row', async () => {
      // Insert whole series and season 1 for the same tmdbId
      await upsertAnime(makeAnimeData({ seasonNumber: null, title: 'Whole Series' }));
      await upsertAnime(makeAnimeData({ seasonNumber: 1, title: 'Season 1' }));

      // Upsert whole series again
      await upsertAnime(makeAnimeData({ seasonNumber: null, title: 'Whole Series Updated' }));

      // Season 1 row should be untouched
      const { rows } = await query(
        'SELECT * FROM anime WHERE tmdb_id = $1 AND season_number = 1',
        [1399]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('Season 1');
    });
  });

  // -------------------------------------------------------------------------
  // Return shape
  // -------------------------------------------------------------------------

  describe('return value', () => {
    it('returns all expected columns', async () => {
      const result = await upsertAnime(makeAnimeData());

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
        expect(result, `missing key: ${key}`).toHaveProperty(key);
      }
    });

    it('returns null for optional fields that were not provided', async () => {
      const result = await upsertAnime(
        makeAnimeData({
          tmdbId: 9999,
          originalTitle: null,
          overview: null,
          posterPath: null,
          backdropPath: null,
          episodeCount: null,
          seasonCount: null,
          status: null,
          firstAirDate: null,
        })
      );

      expect(result.original_title).toBeNull();
      expect(result.overview).toBeNull();
      expect(result.poster_path).toBeNull();
      expect(result.backdrop_path).toBeNull();
      expect(result.episode_count).toBeNull();
      expect(result.season_count).toBeNull();
      expect(result.status).toBeNull();
      expect(result.first_air_date).toBeNull();
    });

    it('returns genres as an array', async () => {
      const result = await upsertAnime(makeAnimeData({ genres: ['Action', 'Sci-Fi'] }));
      expect(Array.isArray(result.genres)).toBe(true);
      expect(result.genres).toEqual(['Action', 'Sci-Fi']);
    });

    it('returns an empty array when genres is empty', async () => {
      const result = await upsertAnime(makeAnimeData({ tmdbId: 9999, genres: [] }));
      expect(result.genres).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('throws if tmdbId is missing', async () => {
      await expect(
        upsertAnime(makeAnimeData({ tmdbId: null }))
      ).rejects.toThrow();
    });

    it('throws if tmdbType is missing', async () => {
      await expect(
        upsertAnime(makeAnimeData({ tmdbType: null }))
      ).rejects.toThrow();
    });

    it('throws if title is missing', async () => {
      await expect(
        upsertAnime(makeAnimeData({ tmdbId: 9999, title: null }))
      ).rejects.toThrow();
    });
  });
});