import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../../app.js';
import { createTestUser } from './testHelpers.js';
import { upsertAnime } from '../../db/anime.js';
import { query } from '../../db/db.js';

const request = supertest(app);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TMDB_ID_BASE = 88100; // dedicated range — no overlap with other test files
let _seq = 0;

function makeTmdbId() {
  return TMDB_ID_BASE + ++_seq;
}

async function makeAnime(overrides = {}) {
  const tmdbId = overrides.tmdbId ?? makeTmdbId();
  return upsertAnime({
    tmdbId,
    tmdbType: overrides.tmdbType ?? 'tv',
    seasonNumber: overrides.seasonNumber ?? null,
    title: overrides.title ?? `Anime ${tmdbId}`,
    originalTitle: null,
    overview: overrides.overview ?? 'A test anime.',
    posterPath: overrides.posterPath ?? null,
    backdropPath: null,
    episodeCount: overrides.episodeCount ?? null,
    seasonCount: null,
    status: overrides.status ?? 'Ended',
    firstAirDate: overrides.firstAirDate ?? '2021-01-01',
    genres: overrides.genres ?? [],
  });
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let user, token;
let adminUser, adminToken;
let animeA, animeB, animeC;

beforeAll(async () => {
  [
    { user, token },
    { user: adminUser, token: adminToken },
  ] = await Promise.all([
    createTestUser(),
    createTestUser({ role: 'admin' }),
  ]);

  [animeA, animeB, animeC] = await Promise.all([
    makeAnime({ title: 'Attack on Titan' }),
    makeAnime({ title: 'Attack on Beetles' }),
    makeAnime({ title: 'Fullmetal Alchemist' }),
  ]);
});

afterAll(async () => {
  await query(
    `DELETE FROM anime WHERE tmdb_id >= $1 AND tmdb_id < $2`,
    [TMDB_ID_BASE, TMDB_ID_BASE + 200],
  );
});

// ---------------------------------------------------------------------------
// GET /api/anime/search
// ---------------------------------------------------------------------------

describe('GET /api/anime/search', () => {
  it('returns 200 and matching anime for a valid query', async () => {
    const res = await request
      .get('/api/anime/search')
      .query({ q: 'Attack' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(typeof res.body.hasMore).toBe('boolean');

    const titles = res.body.results.map((a) => a.title);
    expect(titles).toContain('Attack on Titan');
    expect(titles).toContain('Attack on Beetles');
  });

  it('does not return anime that do not match the query', async () => {
    const res = await request
      .get('/api/anime/search')
      .query({ q: 'Attack' });

    expect(res.status).toBe(200);
    const titles = res.body.results.map((a) => a.title);
    expect(titles).not.toContain('Fullmetal Alchemist');
  });

  it('returns 200 and an empty array when nothing matches', async () => {
    const res = await request
      .get('/api/anime/search')
      .query({ q: 'zzznomatchzzz' });

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(res.body.hasMore).toBe(false);
  });

  it('returns the correct fields on each result', async () => {
    const res = await request
      .get('/api/anime/search')
      .query({ q: 'Fullmetal' });

    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThanOrEqual(1);

    const anime = res.body.results[0];
    expect(anime).toMatchObject({
      title: 'Fullmetal Alchemist',
    });
    expect(anime.id).toBeDefined();
    expect(anime.tmdb_id).toBeDefined();
    expect(anime.poster_path !== undefined).toBe(true);
  });

  it('returns 400 when q param is missing', async () => {
    const res = await request.get('/api/anime/search');

    expect(res.status).toBe(400);
  });

  it('returns 400 when q param is an empty string', async () => {
    const res = await request
      .get('/api/anime/search')
      .query({ q: '' });

    expect(res.status).toBe(400);
  });

  it('is case-insensitive', async () => {
    const res = await request
      .get('/api/anime/search')
      .query({ q: 'attack on titan' });

    expect(res.status).toBe(200);
    const titles = res.body.results.map((a) => a.title);
    expect(titles).toContain('Attack on Titan');
  });
});

// ---------------------------------------------------------------------------
// GET /api/anime/search — pagination
// ---------------------------------------------------------------------------

describe('GET /api/anime/search — pagination', () => {
  const PAGE_TMDB_BASE = 88600;
  let pageAnime;

  beforeAll(async () => {
    pageAnime = await Promise.all(
      Array.from({ length: 55 }, (_, i) =>
        makeAnime({
          tmdbId: PAGE_TMDB_BASE + i,
          title: `Pagination Search Show ${String(i).padStart(2, '0')}`,
        })
      )
    );
  });

  afterAll(async () => {
    await query('DELETE FROM anime WHERE tmdb_id >= $1 AND tmdb_id < $2', [PAGE_TMDB_BASE, PAGE_TMDB_BASE + 100]);
  });

  it('returns a batch of 50 with hasMore true when more than 50 rows match', async () => {
    const res = await request
      .get('/api/anime/search')
      .query({ q: 'Pagination Search Show' });

    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(50);
    expect(res.body.hasMore).toBe(true);
  });

  it('returns the next batch with no overlap when offset is provided', async () => {
    const first = await request
      .get('/api/anime/search')
      .query({ q: 'Pagination Search Show' });
    const second = await request
      .get('/api/anime/search')
      .query({ q: 'Pagination Search Show', offset: 50 });

    expect(second.status).toBe(200);
    expect(second.body.results.length).toBe(5);
    expect(second.body.hasMore).toBe(false);

    const firstIds = new Set(first.body.results.map((a) => a.id));
    const overlap = second.body.results.filter((a) => firstIds.has(a.id));
    expect(overlap).toHaveLength(0);
  });

  it('returns 400 for a negative offset', async () => {
    const res = await request
      .get('/api/anime/search')
      .query({ q: 'Pagination Search Show', offset: '-1' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-integer offset', async () => {
    const res = await request
      .get('/api/anime/search')
      .query({ q: 'Pagination Search Show', offset: 'abc' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/anime/browse
// ---------------------------------------------------------------------------

describe('GET /api/anime/browse', () => {
  it('returns 200 and an array of anime', async () => {
    const res = await request.get('/api/anime/browse');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(typeof res.body.hasMore).toBe('boolean');
  });

  it('returns the correct fields on each result', async () => {
    const res = await request.get('/api/anime/browse');

    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThanOrEqual(1);

    const anime = res.body.results[0];
    expect(anime.id).toBeDefined();
    expect(anime.title).toBeDefined();
    expect(anime.tmdb_id).toBeDefined();
    expect(anime.poster_path !== undefined).toBe(true);
  });

  it('accepts a mode=top_rated query param', async () => {
    const res = await request
      .get('/api/anime/browse')
      .query({ mode: 'top_rated' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('accepts a mode=recent query param', async () => {
    const res = await request
      .get('/api/anime/browse')
      .query({ mode: 'recent' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('returns 400 for an invalid mode value', async () => {
    const res = await request
      .get('/api/anime/browse')
      .query({ mode: 'invalid_mode' });

    expect(res.status).toBe(400);
  });

  it('reports mode: "recent" when top_rated falls back due to no reviewed anime', async () => {
    // Scoped to a year no fixture anywhere in the suite would plausibly use,
    // so top_rated is guaranteed empty regardless of unrelated review data
    // that may exist elsewhere in the shared test DB.
    const res = await request
      .get('/api/anime/browse')
      .query({ mode: 'top_rated', year: '1901' });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('recent');
  });
});

// ---------------------------------------------------------------------------
// GET /api/anime/browse — pagination
// ---------------------------------------------------------------------------

describe('GET /api/anime/browse — pagination', () => {
  const PAGE_TMDB_BASE = 88500;
  const FILTERED_GENRE_COUNT = 3;

  beforeAll(async () => {
    await Promise.all(
      Array.from({ length: 55 }, (_, i) =>
        makeAnime({
          tmdbId: PAGE_TMDB_BASE + i,
          title: `Pagination Browse Show ${String(i).padStart(2, '0')}`,
          firstAirDate: `2024-01-${String((i % 27) + 1).padStart(2, '0')}`,
          genres: i < FILTERED_GENRE_COUNT ? ['Documentary'] : [],
        })
      )
    );
  });

  afterAll(async () => {
    await query('DELETE FROM anime WHERE tmdb_id >= $1 AND tmdb_id < $2', [PAGE_TMDB_BASE, PAGE_TMDB_BASE + 100]);
  });

  it('returns a batch of 50 with hasMore true when more than 50 rows exist', async () => {
    const res = await request
      .get('/api/anime/browse')
      .query({ mode: 'recent' });

    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(50);
    expect(res.body.hasMore).toBe(true);
  });

  it('returns the next batch with no overlap when offset is provided', async () => {
    const first = await request
      .get('/api/anime/browse')
      .query({ mode: 'recent' });
    const second = await request
      .get('/api/anime/browse')
      .query({ mode: 'recent', offset: 50 });

    expect(second.status).toBe(200);

    const firstIds = new Set(first.body.results.map((a) => a.id));
    const overlap = second.body.results.filter((a) => firstIds.has(a.id));
    expect(overlap).toHaveLength(0);
  });

  it('eventually reaches hasMore: false when paginating to the end', async () => {
    const res = await request
      .get('/api/anime/browse')
      .query({ mode: 'recent', offset: 50 });

    expect(res.status).toBe(200);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.results.length).toBeGreaterThan(0);
  });

  it('combines pagination with an active filter, scoping offset to the filtered set', async () => {
    // Only FILTERED_GENRE_COUNT of the 55 fixtures carry this genre — the
    // filter must be applied to the whole catalog before paging, not to
    // whatever page would have been returned unfiltered.
    const firstPage = await request
      .get('/api/anime/browse')
      .query({ mode: 'recent', genre: 'Documentary' });

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.results.length).toBe(FILTERED_GENRE_COUNT);
    expect(firstPage.body.hasMore).toBe(false);

    const secondPage = await request
      .get('/api/anime/browse')
      .query({ mode: 'recent', genre: 'Documentary', offset: FILTERED_GENRE_COUNT });

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.results).toEqual([]);
    expect(secondPage.body.hasMore).toBe(false);
  });

  it('returns 400 for a negative offset', async () => {
    const res = await request
      .get('/api/anime/browse')
      .query({ mode: 'recent', offset: '-1' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-integer offset', async () => {
    const res = await request
      .get('/api/anime/browse')
      .query({ mode: 'recent', offset: 'abc' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/anime/search and /api/anime/browse — season/year/genre filters
// ---------------------------------------------------------------------------

describe('season/year/genre filters', () => {
  let winterAnime, summerAnime, year2023Anime, actionAnime, dramaAnime;

  beforeAll(async () => {
    [winterAnime, summerAnime, year2023Anime, actionAnime, dramaAnime] = await Promise.all([
      makeAnime({ title: 'Winter Filter Show', firstAirDate: '2024-01-15' }),
      makeAnime({ title: 'Summer Filter Show', firstAirDate: '2024-07-15' }),
      makeAnime({ title: 'Old Year Show', firstAirDate: '2023-05-01' }),
      makeAnime({ title: 'Action Filter Show', genres: ['Action & Adventure'] }),
      makeAnime({ title: 'Drama Filter Show', genres: ['Drama'] }),
    ]);
  });

  describe('on /browse', () => {
    it('filters by a valid season', async () => {
      const res = await request
        .get('/api/anime/browse')
        .query({ mode: 'recent', season: 'winter' });

      expect(res.status).toBe(200);
      const ids = res.body.results.map((a) => a.id);
      expect(ids).toContain(winterAnime.id);
      expect(ids).not.toContain(summerAnime.id);
    });

    it('returns 400 for an invalid season', async () => {
      const res = await request
        .get('/api/anime/browse')
        .query({ mode: 'recent', season: 'monsoon' });

      expect(res.status).toBe(400);
    });

    it('filters by a valid year', async () => {
      const res = await request
        .get('/api/anime/browse')
        .query({ mode: 'recent', year: '2023' });

      expect(res.status).toBe(200);
      const ids = res.body.results.map((a) => a.id);
      expect(ids).toContain(year2023Anime.id);
      expect(ids).not.toContain(winterAnime.id);
    });

    it('returns 400 for a malformed year', async () => {
      const res = await request
        .get('/api/anime/browse')
        .query({ mode: 'recent', year: '23' });

      expect(res.status).toBe(400);
    });

    it('filters by a single genre', async () => {
      const res = await request
        .get('/api/anime/browse')
        .query({ mode: 'recent', genre: 'Action & Adventure' });

      expect(res.status).toBe(200);
      const ids = res.body.results.map((a) => a.id);
      expect(ids).toContain(actionAnime.id);
      expect(ids).not.toContain(dramaAnime.id);
    });

    it('filters by multiple genres with OR matching', async () => {
      const res = await request
        .get('/api/anime/browse')
        .query({ mode: 'recent', genre: ['Action & Adventure', 'Drama'] });

      expect(res.status).toBe(200);
      const ids = res.body.results.map((a) => a.id);
      expect(ids).toContain(actionAnime.id);
      expect(ids).toContain(dramaAnime.id);
    });

    it('returns 400 for an unknown genre', async () => {
      const res = await request
        .get('/api/anime/browse')
        .query({ mode: 'recent', genre: 'Not A Real Genre' });

      expect(res.status).toBe(400);
    });

    it('combines season and year filters', async () => {
      const res = await request
        .get('/api/anime/browse')
        .query({ mode: 'recent', season: 'winter', year: '2024' });

      expect(res.status).toBe(200);
      const ids = res.body.results.map((a) => a.id);
      expect(ids).toContain(winterAnime.id);
      expect(ids).not.toContain(summerAnime.id);
      expect(ids).not.toContain(year2023Anime.id);
    });
  });

  describe('on /search', () => {
    it('combines a title query with a genre filter', async () => {
      const res = await request
        .get('/api/anime/search')
        .query({ q: 'Filter Show', genre: 'Action & Adventure' });

      expect(res.status).toBe(200);
      const ids = res.body.results.map((a) => a.id);
      expect(ids).toContain(actionAnime.id);
      expect(ids).not.toContain(dramaAnime.id);
    });

    it('returns 400 for an invalid season on search', async () => {
      const res = await request
        .get('/api/anime/search')
        .query({ q: 'Filter Show', season: 'monsoon' });

      expect(res.status).toBe(400);
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/anime/:id
// ---------------------------------------------------------------------------

describe('GET /api/anime/:id', () => {
  it('returns 200 and the correct anime for a valid id', async () => {
    const res = await request.get(`/api/anime/${animeA.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: animeA.id,
      title: 'Attack on Titan',
    });
  });

  it('returns the correct fields', async () => {
    const res = await request.get(`/api/anime/${animeA.id}`);

    expect(res.status).toBe(200);
    const anime = res.body;
    expect(anime.id).toBeDefined();
    expect(anime.tmdb_id).toBeDefined();
    expect(anime.title).toBeDefined();
    expect(anime.overview).toBeDefined();
    expect(anime.status).toBeDefined();
    expect(anime.poster_path !== undefined).toBe(true);
    expect(anime.first_air_date !== undefined).toBe(true);
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await request.get('/api/anime/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-integer id', async () => {
    const res = await request.get('/api/anime/not-an-id');

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/anime/fetch/:tmdbId
// ---------------------------------------------------------------------------

describe('POST /api/anime/fetch/:tmdbId', () => {
  it('returns 200 and the anime when it is already cached', async () => {
    const res = await request
      .post(`/api/anime/fetch/${animeA.tmdb_id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: animeA.id,
      tmdb_id: animeA.tmdb_id,
      title: 'Attack on Titan',
    });
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request.post(`/api/anime/fetch/${animeA.tmdb_id}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is malformed', async () => {
    const res = await request
      .post(`/api/anime/fetch/${animeA.tmdb_id}`)
      .set('Authorization', 'Bearer not.a.real.token');

    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-integer tmdbId', async () => {
    const res = await request
      .post('/api/anime/fetch/not-a-number')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns the correct fields on a cache hit', async () => {
    const res = await request
      .post(`/api/anime/fetch/${animeB.tmdb_id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const anime = res.body;
    expect(anime.id).toBeDefined();
    expect(anime.tmdb_id).toBeDefined();
    expect(anime.title).toBeDefined();
    expect(anime.overview !== undefined).toBe(true);
    expect(anime.poster_path !== undefined).toBe(true);
  });

  // NOTE: cache-miss (TMDB live fetch) tests belong in integration tests
  // once the TMDB client is wired up. Skipping here to avoid real HTTP calls.
});

// ---------------------------------------------------------------------------
// POST /api/anime/fetch/:tmdbId — season query param
// ---------------------------------------------------------------------------

describe('POST /api/anime/fetch/:tmdbId — season query param', () => {
  let seasonZeroAnime, movieAnime;

  beforeAll(async () => {
    [seasonZeroAnime, movieAnime] = await Promise.all([
      makeAnime({ title: 'Season Zero Show', seasonNumber: 0 }),
      makeAnime({ title: 'Test Movie', tmdbType: 'movie' }),
    ]);
  });

  it('returns 400 for a non-integer season', async () => {
    const res = await request
      .post(`/api/anime/fetch/${animeA.tmdb_id}`)
      .query({ season: 'abc' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 for a negative season', async () => {
    const res = await request
      .post(`/api/anime/fetch/${animeA.tmdb_id}`)
      .query({ season: '-1' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('accepts season=0 and returns the matching season-specific cached row', async () => {
    const res = await request
      .post(`/api/anime/fetch/${seasonZeroAnime.tmdb_id}`)
      .query({ season: '0' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: seasonZeroAnime.id,
      season_number: 0,
    });
  });

  it('ignores the season param for movie type and returns the cached movie', async () => {
    const res = await request
      .post(`/api/anime/fetch/${movieAnime.tmdb_id}`)
      .query({ type: 'movie', season: '2' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: movieAnime.id,
      tmdb_type: 'movie',
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/anime/fetch/:tmdbId — conditional "All Seasons" suffix
// ---------------------------------------------------------------------------

describe('POST /api/anime/fetch/:tmdbId — conditional "All Seasons" suffix', () => {
  it('suffixes the whole-series row when fetching an already-cached season sibling', async () => {
    const tmdbId = makeTmdbId();
    const wholeSeries = await makeAnime({ tmdbId, title: 'Suffix Test Show', seasonNumber: null });
    await makeAnime({ tmdbId, title: 'Suffix Test Show — Season 1', seasonNumber: 1 });

    const res = await request
      .post(`/api/anime/fetch/${tmdbId}`)
      .query({ season: '1' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const wholeSeriesRes = await request.get(`/api/anime/${wholeSeries.id}`);
    expect(wholeSeriesRes.body.title).toBe('Suffix Test Show — All Seasons');
  });

  it('does not suffix a whole-series row that has no season-specific siblings', async () => {
    const soloShow = await makeAnime({ title: 'Solo Show No Seasons', seasonNumber: null });

    const res = await request
      .post(`/api/anime/fetch/${soloShow.tmdb_id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Solo Show No Seasons');
  });

  it('does not error when fetching a season for a series with no whole-series row yet', async () => {
    const tmdbId = makeTmdbId();
    await makeAnime({ tmdbId, title: 'Season Only Show — Season 1', seasonNumber: 1 });

    const res = await request
      .post(`/api/anime/fetch/${tmdbId}`)
      .query({ season: '1' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Season Only Show — Season 1');
  });

  it('suffixes the whole-series row in its own response when fetched after a season sibling already exists', async () => {
    // Ordering case: the season row was added first (e.g. via a direct
    // season fetch), and only later does someone fetch the whole-series
    // row itself. It should come back already suffixed, not stale bare —
    // this caught a real gap where Vinland Saga's whole-series row was
    // created bare because its season 2 row already existed.
    const tmdbId = makeTmdbId();
    await makeAnime({ tmdbId, title: 'Ordering Test Show — Season 1', seasonNumber: 1 });
    await makeAnime({ tmdbId, title: 'Ordering Test Show', seasonNumber: null });

    const res = await request
      .post(`/api/anime/fetch/${tmdbId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Ordering Test Show — All Seasons');
  });
});
