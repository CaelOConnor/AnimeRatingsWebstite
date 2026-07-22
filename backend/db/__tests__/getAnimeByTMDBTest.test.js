import { describe, it, expect, afterEach } from 'vitest';
import { getAnimeByTmdbIdentifiers } from '../anime.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

// Dedicated range (10240-10249) — verified against every real id in
// seed.js's TV_IDS/MOVIE_IDS/SEASON_ENTRIES before picking it. The previous
// version of this file used `tmdb_id >= 1000` as its cleanup boundary,
// which matched virtually the entire real catalog (all real TMDB ids in
// this project are >= 1000) and wiped it when this suite was ever run
// against the dev DB by mistake.
const TMDB_ID_BASE = 10240;

const BASE_ANIME = {
  tmdb_id: TMDB_ID_BASE,
  tmdb_type: 'tv',
  season_number: null,
  title: 'Attack on Titan',
  original_title: '進撃の巨人',
  overview: 'Humanity fights titans.',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  episode_count: 25,
  season_count: 4,
  status: 'Ended',
  first_air_date: '2013-04-07',
  genres: ['Action', 'Drama'],
};

afterEach(async () => {
  // Clean up all anime inserted during tests — scoped to this file's
  // dedicated range only, never a real-catalog-adjacent boundary.
  await query('DELETE FROM anime WHERE tmdb_id >= $1 AND tmdb_id < $2', [TMDB_ID_BASE, TMDB_ID_BASE + 10]);
});

async function createTestAnime(overrides = {}) {
  const anime = {
    ...BASE_ANIME,
    ...overrides,
  };

  const result = await query(
    `
      INSERT INTO anime (
        tmdb_id,
        tmdb_type,
        season_number,
        title,
        original_title,
        overview,
        poster_path,
        backdrop_path,
        episode_count,
        season_count,
        status,
        first_air_date,
        genres
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13
      )
      RETURNING *
    `,
    [
      anime.tmdb_id,
      anime.tmdb_type,
      anime.season_number,
      anime.title,
      anime.original_title,
      anime.overview,
      anime.poster_path,
      anime.backdrop_path,
      anime.episode_count,
      anime.season_count,
      anime.status,
      anime.first_air_date,
      anime.genres,
    ]
  );

  return result.rows[0];
}

// ---------------------------------------------------------------------------
// getAnimeByTmdbIdentifiers
// ---------------------------------------------------------------------------

describe('getAnimeByTmdbIdentifiers', () => {

  it('returns the anime row when an exact match exists', async () => {
    const anime = await createTestAnime();

    const result = await getAnimeByTmdbIdentifiers(
      anime.tmdb_id,
      anime.tmdb_type,
      anime.season_number
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(anime.id);
    expect(result.title).toBe(BASE_ANIME.title);
  });

  it('returns null when no anime matches the identifiers', async () => {
    const result = await getAnimeByTmdbIdentifiers(
      999999,
      'tv',
      null
    );

    expect(result).toBeNull();
  });

  it('correctly finds a whole series entry when season_number is null', async () => {
    const anime = await createTestAnime({
      tmdb_id: TMDB_ID_BASE + 1,
      season_number: null,
    });

    const result = await getAnimeByTmdbIdentifiers(
      TMDB_ID_BASE + 1,
      'tv',
      null
    );

    expect(result).not.toBeNull();
    expect(result.id).toBe(anime.id);
    expect(result.season_number).toBeNull();
  });

  it('correctly finds a season entry when season_number is provided', async () => {
    const anime = await createTestAnime({
      tmdb_id: TMDB_ID_BASE + 2,
      season_number: 1,
      title: 'Attack on Titan Season 1',
    });

    const result = await getAnimeByTmdbIdentifiers(
      TMDB_ID_BASE + 2,
      'tv',
      1
    );

    expect(result).not.toBeNull();
    expect(result.id).toBe(anime.id);
    expect(result.season_number).toBe(1);
  });

  it('does not confuse a whole series with a specific season', async () => {
    await createTestAnime({
      tmdb_id: TMDB_ID_BASE + 3,
      season_number: null,
      title: 'Full Series',
    });

    await createTestAnime({
      tmdb_id: TMDB_ID_BASE + 3,
      season_number: 1,
      title: 'Season 1',
    });

    const result = await getAnimeByTmdbIdentifiers(
      TMDB_ID_BASE + 3,
      'tv',
      1
    );

    expect(result.title).toBe('Season 1');
    expect(result.season_number).toBe(1);
  });

  it('does not confuse tv and movie entries with the same tmdb_id', async () => {
    await createTestAnime({
      tmdb_id: TMDB_ID_BASE + 4,
      tmdb_type: 'tv',
      title: 'TV Version',
    });

    await createTestAnime({
      tmdb_id: TMDB_ID_BASE + 4,
      tmdb_type: 'movie',
      title: 'Movie Version',
    });

    const result = await getAnimeByTmdbIdentifiers(
      TMDB_ID_BASE + 4,
      'movie',
      null
    );

    expect(result.title).toBe('Movie Version');
    expect(result.tmdb_type).toBe('movie');
  });

  it('returns all expected anime fields', async () => {
    await createTestAnime({
      tmdb_id: TMDB_ID_BASE + 5,
    });

    const result = await getAnimeByTmdbIdentifiers(
      TMDB_ID_BASE + 5,
      'tv',
      null
    );

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('tmdb_id');
    expect(result).toHaveProperty('tmdb_type');
    expect(result).toHaveProperty('season_number');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('original_title');
    expect(result).toHaveProperty('overview');
    expect(result).toHaveProperty('poster_path');
    expect(result).toHaveProperty('backdrop_path');
    expect(result).toHaveProperty('episode_count');
    expect(result).toHaveProperty('season_count');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('first_air_date');
    expect(result).toHaveProperty('genres');
    expect(result).toHaveProperty('cached_at');
  });

  it('returns genres as an array', async () => {
    await createTestAnime({
      tmdb_id: TMDB_ID_BASE + 6,
      genres: ['Action', 'Fantasy'],
    });

    const result = await getAnimeByTmdbIdentifiers(
      TMDB_ID_BASE + 6,
      'tv',
      null
    );

    expect(Array.isArray(result.genres)).toBe(true);
    expect(result.genres).toEqual(['Action', 'Fantasy']);
  });

  it('returns a single object, not an array', async () => {
    await createTestAnime({
      tmdb_id: TMDB_ID_BASE + 7,
    });

    const result = await getAnimeByTmdbIdentifiers(
      TMDB_ID_BASE + 7,
      'tv',
      null
    );

    expect(Array.isArray(result)).toBe(false);
    expect(typeof result).toBe('object');
  });

  it('returns the correct anime when multiple anime rows exist', async () => {
    await createTestAnime({
      tmdb_id: TMDB_ID_BASE + 8,
      title: 'Naruto',
    });

    const target = await createTestAnime({
      tmdb_id: TMDB_ID_BASE + 9,
      title: 'Bleach',
    });

    const result = await getAnimeByTmdbIdentifiers(
      TMDB_ID_BASE + 9,
      'tv',
      null
    );

    expect(result.id).toBe(target.id);
    expect(result.title).toBe('Bleach');
  });

  it('throws when tmdb_id is missing', async () => {
    await expect(
      getAnimeByTmdbIdentifiers(undefined, 'tv', null)
    ).rejects.toThrow('tmdbId is required');
  });

  it('throws when tmdb_type is missing', async () => {
    await expect(
      getAnimeByTmdbIdentifiers(TMDB_ID_BASE, undefined, null)
    ).rejects.toThrow('tmdbType is required');
  });

});
