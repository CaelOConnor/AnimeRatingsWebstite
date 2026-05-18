import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import supertest from 'supertest';
import app from '../../app.js';
import { createTestUser } from '../testHelpers.js';
import { addToWatchlist } from '../../db/watchlist.js';
import { upsertAnime } from '../../db/anime.js';
import { query } from '../../db/db.js';

const request = supertest(app);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeAnime(tmdbId) {
  return upsertAnime({
    tmdbId,
    tmdbType: 'tv',
    seasonNumber: null,
    title: `Test Anime ${tmdbId}`,
    originalTitle: null,
    overview: 'A test anime.',
    posterPath: null,
    backdropPath: null,
    episodeCount: null,
    seasonCount: null,
    status: 'Ended',
    firstAirDate: '2020-01-01',
    genres: [],
  });
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let user, token;
let otherUser, otherToken;
let animeA, animeB;

beforeAll(async () => {
  [
    { user, token },
    { user: otherUser, token: otherToken },
  ] = await Promise.all([
    createTestUser(),
    createTestUser(),
  ]);

  [animeA, animeB] = await Promise.all([
    makeAnime(99990),
    makeAnime(99991),
  ]);
});

// ---------------------------------------------------------------------------
// Cleanup — wipe watchlist rows between tests; users and anime persist.
// ---------------------------------------------------------------------------

afterEach(async () => {
  await query(
    `DELETE FROM watchlist WHERE user_id IN ($1, $2)`,
    [user.id, otherUser.id],
  );
});

// ---------------------------------------------------------------------------
// GET /api/watchlist
// ---------------------------------------------------------------------------

describe('GET /api/watchlist', () => {
  it('returns 200 and an empty array when the user has no watchlist entries', async () => {
    const res = await request
      .get('/api/watchlist')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 and all entries for the authenticated user', async () => {
    await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });
    await addToWatchlist({ userId: user.id, animeId: animeB.id, status: 'completed' });

    const res = await request
      .get('/api/watchlist')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('returns the correct fields on each entry including anime title and poster_path', async () => {
    await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'plan_to_watch' });

    const res = await request
      .get('/api/watchlist')
      .set('Authorization', `Bearer ${token}`);

    const entry = res.body[0];
    expect(entry).toMatchObject({
      user_id: user.id,
      anime_id: animeA.id,
      status: 'plan_to_watch',
      episodes_watched: 0,
    });
    expect(entry.id).toBeDefined();
    expect(entry.updated_at).toBeDefined();
    // joined from anime table
    expect(entry.title).toBeDefined();
    expect(entry.poster_path !== undefined).toBe(true);
  });

  it('does not return entries belonging to other users', async () => {
    await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });
    await addToWatchlist({ userId: otherUser.id, animeId: animeB.id, status: 'watching' });

    const res = await request
      .get('/api/watchlist')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].anime_id).toBe(animeA.id);
  });

  it('returns entries ordered by updated_at descending', async () => {
    await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });
    // Small delay so updated_at values are distinct
    await new Promise((r) => setTimeout(r, 20));
    await addToWatchlist({ userId: user.id, animeId: animeB.id, status: 'completed' });

    const res = await request
      .get('/api/watchlist')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body[0].anime_id).toBe(animeB.id);
    expect(res.body[1].anime_id).toBe(animeA.id);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request.get('/api/watchlist');

    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is malformed', async () => {
    const res = await request
      .get('/api/watchlist')
      .set('Authorization', 'Bearer not.a.real.token');

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/watchlist
// ---------------------------------------------------------------------------

describe('POST /api/watchlist', () => {
  function postWatchlist(body, authToken) {
    const req = request.post('/api/watchlist');
    if (authToken) req.set('Authorization', `Bearer ${authToken}`);
    return req.send(body);
  }

  describe('success', () => {
    it('adds an entry and returns 201 with the new watchlist entry', async () => {
      const res = await postWatchlist(
        { animeId: animeA.id, status: 'plan_to_watch' },
        token,
      );

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        user_id: user.id,
        anime_id: animeA.id,
        status: 'plan_to_watch',
        episodes_watched: 0,
      });
      expect(res.body.id).toBeDefined();
    });

    it('uses plan_to_watch as the default status when status is omitted', async () => {
      const res = await postWatchlist({ animeId: animeA.id }, token);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('plan_to_watch');
    });

    it('accepts status = watching', async () => {
      const res = await postWatchlist({ animeId: animeA.id, status: 'watching' }, token);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('watching');
    });

    it('accepts status = completed', async () => {
      const res = await postWatchlist({ animeId: animeA.id, status: 'completed' }, token);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('completed');
    });

    it('accepts status = dropped', async () => {
      const res = await postWatchlist({ animeId: animeA.id, status: 'dropped' }, token);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('dropped');
    });

    it('different users can add the same anime to their watchlists independently', async () => {
      const resA = await postWatchlist({ animeId: animeA.id, status: 'watching' }, token);
      const resB = await postWatchlist({ animeId: animeA.id, status: 'completed' }, otherToken);

      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);
    });
  });

  describe('authentication', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await postWatchlist({ animeId: animeA.id, status: 'watching' });

      expect(res.status).toBe(401);
    });

    it('returns 401 when the token is malformed', async () => {
      const res = await postWatchlist(
        { animeId: animeA.id, status: 'watching' },
        'not.a.real.token',
      );

      expect(res.status).toBe(401);
    });
  });

  describe('input validation', () => {
    it('returns 400 when animeId is missing', async () => {
      const res = await postWatchlist({ status: 'watching' }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when animeId is not a valid UUID', async () => {
      const res = await postWatchlist({ animeId: 'not-a-uuid', status: 'watching' }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when status is an invalid enum value', async () => {
      const res = await postWatchlist({ animeId: animeA.id, status: 'binge_watching' }, token);

      expect(res.status).toBe(400);
    });
  });

  describe('business rules', () => {
    it('returns 409 when the user already has this anime in their watchlist', async () => {
      const first = await postWatchlist({ animeId: animeA.id, status: 'watching' }, token);
      expect(first.status).toBe(201);

      const second = await postWatchlist({ animeId: animeA.id, status: 'completed' }, token);
      expect(second.status).toBe(409);
    });

    it('returns 404 when animeId is a valid UUID but does not exist', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';
      const res = await postWatchlist({ animeId: nonExistentId, status: 'watching' }, token);

      expect(res.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/watchlist/:animeId
// ---------------------------------------------------------------------------

describe('PATCH /api/watchlist/:animeId', () => {
  function patchWatchlist(animeId, body, authToken) {
    const req = request.patch(`/api/watchlist/${animeId}`);
    if (authToken) req.set('Authorization', `Bearer ${authToken}`);
    return req.send(body);
  }

  describe('success', () => {
    it('updates the status and returns 200 with the updated entry', async () => {
      await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'plan_to_watch' });

      const res = await patchWatchlist(animeA.id, { status: 'watching' }, token);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        user_id: user.id,
        anime_id: animeA.id,
        status: 'watching',
      });
    });

    it('can update to every valid status value', async () => {
      const statuses = ['watching', 'completed', 'plan_to_watch', 'dropped'];

      for (const status of statuses) {
        await query(`DELETE FROM watchlist WHERE user_id = $1`, [user.id]);
        await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });

        const res = await patchWatchlist(animeA.id, { status }, token);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe(status);
      }
    });

    it('returns the full updated entry in the response', async () => {
      await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'plan_to_watch' });

      const res = await patchWatchlist(animeA.id, { status: 'completed' }, token);

      expect(res.body.id).toBeDefined();
      expect(res.body.user_id).toBe(user.id);
      expect(res.body.anime_id).toBe(animeA.id);
      expect(res.body.updated_at).toBeDefined();
    });

    it('a user can only update their own entry, not another user\'s entry for the same anime', async () => {
      await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });
      await addToWatchlist({ userId: otherUser.id, animeId: animeA.id, status: 'watching' });

      const res = await patchWatchlist(animeA.id, { status: 'completed' }, token);
      expect(res.status).toBe(200);
      expect(res.body.user_id).toBe(user.id);
    });
  });

  describe('authentication', () => {
    it('returns 401 when no token is provided', async () => {
      await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });

      const res = await patchWatchlist(animeA.id, { status: 'completed' });

      expect(res.status).toBe(401);
    });

    it('returns 401 when the token is malformed', async () => {
      await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });

      const res = await patchWatchlist(animeA.id, { status: 'completed' }, 'bad.token.here');

      expect(res.status).toBe(401);
    });
  });

  describe('input validation', () => {
    it('returns 400 when animeId param is not a valid UUID', async () => {
      const res = await patchWatchlist('not-a-uuid', { status: 'watching' }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when status is missing', async () => {
      await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });

      const res = await patchWatchlist(animeA.id, {}, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when status is an invalid enum value', async () => {
      await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });

      const res = await patchWatchlist(animeA.id, { status: 'paused' }, token);

      expect(res.status).toBe(400);
    });
  });

  describe('not found', () => {
    it('returns 404 when the user has no entry for this anime', async () => {
      const res = await patchWatchlist(animeA.id, { status: 'watching' }, token);

      expect(res.status).toBe(404);
    });

    it('returns 404 when animeId is a valid UUID that does not exist at all', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';

      const res = await patchWatchlist(nonExistentId, { status: 'watching' }, token);

      expect(res.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/watchlist/:animeId
// ---------------------------------------------------------------------------

describe('DELETE /api/watchlist/:animeId', () => {
  function deleteWatchlist(animeId, authToken) {
    const req = request.delete(`/api/watchlist/${animeId}`);
    if (authToken) req.set('Authorization', `Bearer ${authToken}`);
    return req;
  }

  describe('success', () => {
    it('removes the entry and returns 200 with the deleted row', async () => {
      await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });

      const res = await deleteWatchlist(animeA.id, token);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        user_id: user.id,
        anime_id: animeA.id,
      });
    });

    it('the entry no longer appears in GET /api/watchlist after deletion', async () => {
      await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });

      await deleteWatchlist(animeA.id, token);

      const res = await request
        .get('/api/watchlist')
        .set('Authorization', `Bearer ${token}`);
      const ids = res.body.map((e) => e.anime_id);
      expect(ids).not.toContain(animeA.id);
    });

    it('only removes the requesting user\'s entry, not another user\'s entry for the same anime', async () => {
      await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });
      await addToWatchlist({ userId: otherUser.id, animeId: animeA.id, status: 'watching' });

      await deleteWatchlist(animeA.id, token);

      const res = await request
        .get('/api/watchlist')
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].anime_id).toBe(animeA.id);
    });
  });

  describe('authentication', () => {
    it('returns 401 when no token is provided', async () => {
      await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });

      const res = await deleteWatchlist(animeA.id);

      expect(res.status).toBe(401);
    });

    it('returns 401 when the token is malformed', async () => {
      await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });

      const res = await deleteWatchlist(animeA.id, 'bad.token.here');

      expect(res.status).toBe(401);
    });
  });

  describe('validation and not found', () => {
    it('returns 400 when animeId param is not a valid UUID', async () => {
      const res = await deleteWatchlist('not-a-uuid', token);

      expect(res.status).toBe(400);
    });

    it('returns 404 when the user has no entry for this anime', async () => {
      const res = await deleteWatchlist(animeA.id, token);

      expect(res.status).toBe(404);
    });

    it('returns 404 when animeId is a valid UUID that does not exist at all', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';

      const res = await deleteWatchlist(nonExistentId, token);

      expect(res.status).toBe(404);
    });
  });
});