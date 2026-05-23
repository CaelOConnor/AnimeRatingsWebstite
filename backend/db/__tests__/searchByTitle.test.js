import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { query } from '../db.js';
import { searchAnimeByTitle, upsertAnime } from '../anime.js';

async function createTestAnime(overrides = {}) {
  return await upsertAnime({
    tmdbId: 10290,
    tmdbType: 'tv',
    seasonNumber: null,
    title: 'Test Anime',
    genres: [],
    ...overrides,
  });
}

async function cleanup() {
  await query('DELETE FROM anime WHERE tmdb_id BETWEEN 10290 AND 10299');
}

describe('searchAnimeByTitle', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('matching', () => {
    it('returns a row that exactly matches the query', async () => {
      await createTestAnime({ tmdbId: 10291, title: 'Fullmetal Alchemist' });
      const results = await searchAnimeByTitle('Fullmetal Alchemist');
      expect(results.some((r) => r.title === 'Fullmetal Alchemist')).toBe(true);
    });

    it('matches a partial query against the title', async () => {
      await createTestAnime({ tmdbId: 10291, title: 'Fullmetal Alchemist' });
      const results = await searchAnimeByTitle('Fullmetal');
      expect(results.some((r) => r.title === 'Fullmetal Alchemist')).toBe(true);
    });

    it('matches a substring in the middle of the title', async () => {
      await createTestAnime({ tmdbId: 10291, title: 'Fullmetal Alchemist' });
      const results = await searchAnimeByTitle('metal');
      expect(results.some((r) => r.title === 'Fullmetal Alchemist')).toBe(true);
    });

    it('returns multiple rows when several titles match', async () => {
      await createTestAnime({ tmdbId: 10291, title: 'Fullmetal Alchemist' });
      await createTestAnime({ tmdbId: 10292, title: 'Fullmetal Alchemist: Brotherhood' });
      const results = await searchAnimeByTitle('Fullmetal');
      const titles = results.map((r) => r.title);
      expect(titles).toContain('Fullmetal Alchemist');
      expect(titles).toContain('Fullmetal Alchemist: Brotherhood');
    });

    it('does not return rows that do not match the query', async () => {
      await createTestAnime({ tmdbId: 10291, title: 'Fullmetal Alchemist' });
      await createTestAnime({ tmdbId: 10292, title: 'Attack on Titan' });
      const results = await searchAnimeByTitle('Fullmetal');
      expect(results.some((r) => r.title === 'Attack on Titan')).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('matches regardless of query casing — all lowercase', async () => {
      await createTestAnime({ tmdbId: 10291, title: 'Fullmetal Alchemist' });
      const results = await searchAnimeByTitle('fullmetal alchemist');
      expect(results.some((r) => r.title === 'Fullmetal Alchemist')).toBe(true);
    });

    it('matches regardless of query casing — all uppercase', async () => {
      await createTestAnime({ tmdbId: 10291, title: 'Fullmetal Alchemist' });
      const results = await searchAnimeByTitle('FULLMETAL');
      expect(results.some((r) => r.title === 'Fullmetal Alchemist')).toBe(true);
    });

    it('matches regardless of query casing — mixed case', async () => {
      await createTestAnime({ tmdbId: 10291, title: 'Fullmetal Alchemist' });
      const results = await searchAnimeByTitle('fUlLmEtAl');
      expect(results.some((r) => r.title === 'Fullmetal Alchemist')).toBe(true);
    });
  });

  describe('original_title is not searched', () => {
    it('does not match against original_title', async () => {
      await createTestAnime({ tmdbId: 10291, title: 'Fullmetal Alchemist', originalTitle: '鋼の錬金術師' });
      const results = await searchAnimeByTitle('鋼の錬金術師');
      expect(results.some((r) => r.tmdb_id === 10291)).toBe(false);
    });
  });

  describe('no results', () => {
    it('returns an empty array when nothing matches', async () => {
      await createTestAnime({ tmdbId: 10291, title: 'Fullmetal Alchemist' });
      const results = await searchAnimeByTitle('Naruto');
      expect(Array.isArray(results)).toBe(true);
      expect(results.some((r) => r.tmdb_id === 10291)).toBe(false);
    });

    it('returns an empty array when the table is empty', async () => {
      const results = await searchAnimeByTitle('anything');
      expect(results).toEqual([]);
    });
  });

  describe('return shape', () => {
    it('returns all expected columns', async () => {
      await createTestAnime({ tmdbId: 10291, title: 'Fullmetal Alchemist' });
      const results = await searchAnimeByTitle('Fullmetal');
      const row = results[0];
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

    it('always returns an array', async () => {
      const results = await searchAnimeByTitle('anything');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('validation', () => {
    it('throws if query is missing', async () => {
      await expect(searchAnimeByTitle()).rejects.toThrow();
    });
    it('throws if query is null', async () => {
      await expect(searchAnimeByTitle(null)).rejects.toThrow();
    });
    it('throws if query is an empty string', async () => {
      await expect(searchAnimeByTitle('')).rejects.toThrow();
    });
    it('throws if query is a whitespace-only string', async () => {
      await expect(searchAnimeByTitle('   ')).rejects.toThrow();
    });
  });
});