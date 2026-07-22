import { describe, it, expect, afterEach } from 'vitest';
import { query } from '../db.js';
import { upsertAnime, ensureWholeSeriesTitleSuffixed } from '../anime.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// 88900-89099 — verified against every real id in seed.js's
// TV_IDS/MOVIE_IDS/SEASON_ENTRIES before picking it (the previous value,
// 88700, collided with Vinland Saga's real tmdb_id 88803 and wiped its
// rows when this suite was run against the dev DB by mistake).
const TMDB_ID_BASE = 88900;
let _seq = 0;

function makeTmdbId() {
  return TMDB_ID_BASE + ++_seq;
}

async function cleanup() {
  await query('DELETE FROM anime WHERE tmdb_id >= $1 AND tmdb_id < $2', [TMDB_ID_BASE, TMDB_ID_BASE + 200]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ensureWholeSeriesTitleSuffixed', () => {
  afterEach(async () => {
    await cleanup();
  });

  it('suffixes a plain whole-series title when it has a season sibling', async () => {
    const tmdbId = makeTmdbId();
    await upsertAnime({
      tmdbId, tmdbType: 'tv', seasonNumber: null, title: 'Test Show', genres: [],
    });
    await upsertAnime({
      tmdbId, tmdbType: 'tv', seasonNumber: 1, title: 'Test Show — Season 1', genres: [],
    });

    const updated = await ensureWholeSeriesTitleSuffixed(tmdbId, 'tv');

    expect(updated.title).toBe('Test Show — All Seasons');
  });

  it('is idempotent — does not double-suffix an already-suffixed title', async () => {
    const tmdbId = makeTmdbId();
    await upsertAnime({
      tmdbId, tmdbType: 'tv', seasonNumber: null, title: 'Test Show — All Seasons', genres: [],
    });

    const updated = await ensureWholeSeriesTitleSuffixed(tmdbId, 'tv');

    expect(updated).toBeNull();

    const { rows } = await query('SELECT title FROM anime WHERE tmdb_id = $1 AND season_number IS NULL', [tmdbId]);
    expect(rows[0].title).toBe('Test Show — All Seasons');
  });

  it('does not suffix a whole-series row that has no season-specific siblings', async () => {
    const tmdbId = makeTmdbId();
    await upsertAnime({
      tmdbId, tmdbType: 'tv', seasonNumber: null, title: 'No Seasons Show', genres: [],
    });

    const updated = await ensureWholeSeriesTitleSuffixed(tmdbId, 'tv');

    expect(updated).toBeNull();

    const { rows } = await query('SELECT title FROM anime WHERE tmdb_id = $1 AND season_number IS NULL', [tmdbId]);
    expect(rows[0].title).toBe('No Seasons Show');
  });

  it('returns null and does nothing when no whole-series row exists', async () => {
    const tmdbId = makeTmdbId();
    await upsertAnime({
      tmdbId, tmdbType: 'tv', seasonNumber: 1, title: 'Season Only Show — Season 1', genres: [],
    });

    const updated = await ensureWholeSeriesTitleSuffixed(tmdbId, 'tv');

    expect(updated).toBeNull();
  });

  it('does not touch season-specific rows for the same series', async () => {
    const tmdbId = makeTmdbId();
    await upsertAnime({
      tmdbId, tmdbType: 'tv', seasonNumber: null, title: 'Test Show', genres: [],
    });
    await upsertAnime({
      tmdbId, tmdbType: 'tv', seasonNumber: 1, title: 'Test Show — Season 1', genres: [],
    });

    await ensureWholeSeriesTitleSuffixed(tmdbId, 'tv');

    const { rows } = await query('SELECT title FROM anime WHERE tmdb_id = $1 AND season_number = 1', [tmdbId]);
    expect(rows[0].title).toBe('Test Show — Season 1');
  });

  it('is a no-op for movies', async () => {
    const tmdbId = makeTmdbId();
    await upsertAnime({
      tmdbId, tmdbType: 'movie', seasonNumber: null, title: 'Test Movie', genres: [],
    });

    const updated = await ensureWholeSeriesTitleSuffixed(tmdbId, 'movie');

    expect(updated).toBeNull();

    const { rows } = await query('SELECT title FROM anime WHERE tmdb_id = $1 AND tmdb_type = $2', [tmdbId, 'movie']);
    expect(rows[0].title).toBe('Test Movie');
  });
});
