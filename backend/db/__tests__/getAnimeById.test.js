import { describe, it, expect, afterEach } from 'vitest';
import { query } from '../db.js';
import { getAnimeById } from '../anime.js';
import { upsertAnime } from '../anime.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Inserts a minimal anime row via upsertAnime and returns the full row.
 * Using upsertAnime (rather than raw SQL) keeps the helper resilient to
 * schema changes and consistent with the rest of the DB layer.
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

async function cleanup() {
  await query('DELETE FROM anime WHERE tmdb_id = $1', [99999]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getAnimeById', () => {
  afterEach(async () => {
    await cleanup();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('found', () => {
    it('returns the correct row when given a valid UUID', async () => {
      const inserted = await createTestAnime();
      const result = await getAnimeById(inserted.id);

      expect(result).not.toBeNull();
      expect(result.id).toBe(inserted.id);
      expect(result.tmdb_id).toBe(99999);
      expect(result.title).toBe('Test Anime');
    });

    it('returns all expected columns', async () => {
      const inserted = await createTestAnime();
      const result = await getAnimeById(inserted.id);

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

    it('returns the correct row when multiple anime rows exist', async () => {
      // Insert two rows with different tmdbIds
      const first = await createTestAnime({ tmdbId: 99999, title: 'First Anime' });
      const second = await createTestAnime({ tmdbId: 99999, tmdbType: 'movie', title: 'Second Anime' });

      const result = await getAnimeById(first.id);

      expect(result.id).toBe(first.id);
      expect(result.title).toBe('First Anime');
      expect(result.id).not.toBe(second.id);
    });
  });

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------

  describe('not found', () => {
    it('returns null when the UUID does not exist', async () => {
      // A valid UUID that was never inserted
      const result = await getAnimeById('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('throws if id is null', async () => {
      await expect(getAnimeById(null)).rejects.toThrow();
    });

    it('throws if id is undefined', async () => {
      await expect(getAnimeById(undefined)).rejects.toThrow();
    });

    it('throws if id is not a valid UUID string', async () => {
      await expect(getAnimeById('not-a-uuid')).rejects.toThrow();
    });
  });
});