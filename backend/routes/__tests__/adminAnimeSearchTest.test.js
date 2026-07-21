import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import app from '../../app.js';
import { createTestUser } from './testHelpers.js';
import { query } from '../../db/db.js';

const request = supertest(app);

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

function notFoundResponse() {
  return { ok: false, status: 404, json: async () => ({}) };
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let adminUser, adminToken;
let modUser, modToken;
let regularUser, regularToken;

beforeAll(async () => {
  [
    { user: adminUser, token: adminToken },
    { user: modUser, token: modToken },
    { user: regularUser, token: regularToken },
  ] = await Promise.all([
    createTestUser({ role_type: 'admin' }),
    createTestUser({ role_type: 'moderator' }),
    createTestUser(),
  ]);
});

afterAll(async () => {
  await query(
    `DELETE FROM users WHERE id IN ($1, $2, $3)`,
    [adminUser.id, modUser.id, regularUser.id],
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /api/admin/anime/search
// ---------------------------------------------------------------------------

describe('GET /api/admin/anime/search', () => {
  beforeAll(() => {
    process.env.TMDB_API_KEY = 'test-tmdb-key';
    process.env.TMDB_BASE_URL = TMDB_BASE_URL;
  });

  it('returns 200 and candidates for a text query', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      results: [
        { id: 209867, media_type: 'tv', name: "Frieren: Beyond Journey's End", first_air_date: '2023-09-29', poster_path: '/frieren.jpg', adult: false },
        { id: 372058, media_type: 'movie', title: 'Your Name.', release_date: '2016-07-01', poster_path: '/yourname.jpg', adult: false },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await request
      .get('/api/admin/anime/search')
      .query({ query: 'frieren' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 209867, title: "Frieren: Beyond Journey's End", year: 2023, posterPath: '/frieren.jpg', mediaType: 'tv' },
      { id: 372058, title: 'Your Name.', year: 2016, posterPath: '/yourname.jpg', mediaType: 'movie' },
    ]);
  });

  it('filters out person results and adult results', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      results: [
        { id: 1, media_type: 'person', name: 'Some Actor' },
        { id: 2, media_type: 'tv', name: 'Adult Show', first_air_date: '2020-01-01', poster_path: null, adult: true },
        { id: 3, media_type: 'tv', name: 'Fine Show', first_air_date: '2021-01-01', poster_path: '/fine.jpg', adult: false },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await request
      .get('/api/admin/anime/search')
      .query({ query: 'whatever' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(3);
  });

  it('caps results to at most 8 candidates', async () => {
    const results = Array.from({ length: 15 }, (_, i) => ({
      id: i, media_type: 'tv', name: `Show ${i}`, first_air_date: '2020-01-01', poster_path: null, adult: false,
    }));
    const fetchMock = vi.fn(async () => jsonResponse({ results }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await request
      .get('/api/admin/anime/search')
      .query({ query: 'lots' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(8);
  });

  it('treats a purely numeric query as a direct tv id lookup', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.includes('/tv/209867')) {
        return jsonResponse({ id: 209867, name: "Frieren: Beyond Journey's End", first_air_date: '2023-09-29', poster_path: '/frieren.jpg', adult: false });
      }
      return notFoundResponse();
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request
      .get('/api/admin/anime/search')
      .query({ query: '209867' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 209867, title: "Frieren: Beyond Journey's End", year: 2023, posterPath: '/frieren.jpg', mediaType: 'tv' },
    ]);
    // Should not have hit TMDB's text search for a numeric query.
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls.some((u) => u.includes('/search/multi'))).toBe(false);
  });

  it('falls back to a movie id lookup when the tv lookup 404s', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.includes('/tv/372058')) return notFoundResponse();
      if (url.includes('/movie/372058')) {
        return jsonResponse({ id: 372058, title: 'Your Name.', release_date: '2016-07-01', poster_path: '/yourname.jpg', adult: false });
      }
      return notFoundResponse();
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request
      .get('/api/admin/anime/search')
      .query({ query: '372058' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 372058, title: 'Your Name.', year: 2016, posterPath: '/yourname.jpg', mediaType: 'movie' },
    ]);
  });

  it('returns an empty array when a numeric id matches neither tv nor movie', async () => {
    const fetchMock = vi.fn(async () => notFoundResponse());
    vi.stubGlobal('fetch', fetchMock);

    const res = await request
      .get('/api/admin/anime/search')
      .query({ query: '999999999' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 400 when query is missing', async () => {
    const res = await request
      .get('/api/admin/anime/search')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 when query is empty/whitespace', async () => {
    const res = await request
      .get('/api/admin/anime/search')
      .query({ query: '   ' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('returns 403 for a moderator', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ results: [] })));

    const res = await request
      .get('/api/admin/anime/search')
      .query({ query: 'frieren' })
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 403 for a regular user', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ results: [] })));

    const res = await request
      .get('/api/admin/anime/search')
      .query({ query: 'frieren' })
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request
      .get('/api/admin/anime/search')
      .query({ query: 'frieren' });

    expect(res.status).toBe(401);
  });
});
