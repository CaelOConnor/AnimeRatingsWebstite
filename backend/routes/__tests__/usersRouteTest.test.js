import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../../app.js';
import { createTestUser } from './testHelpers.js';
import { createReview } from '../../db/reviews.js';
import { addToWatchlist } from '../../db/watchlist.js';
import { upsertAnime } from '../../db/anime.js';
import { query } from '../../db/db.js';

const request = supertest(app);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TMDB_ID_BASE = 88300; // dedicated range — no overlap with other test files
let _seq = 0;

async function makeAnime() {
  const tmdbId = TMDB_ID_BASE + ++_seq;
  return upsertAnime({
    tmdbId,
    tmdbType: 'tv',
    seasonNumber: null,
    title: `User Test Anime ${tmdbId}`,
    originalTitle: null,
    overview: 'A test anime.',
    posterPath: null,
    backdropPath: null,
    episodeCount: null,
    seasonCount: null,
    status: 'Ended',
    firstAirDate: '2021-01-01',
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

  [animeA, animeB] = await Promise.all([makeAnime(), makeAnime()]);
});

afterAll(async () => {
  await query(`DELETE FROM users WHERE id IN ($1, $2)`, [user.id, otherUser.id]);
  await query(
    `DELETE FROM anime WHERE tmdb_id >= $1 AND tmdb_id < $2`,
    [TMDB_ID_BASE, TMDB_ID_BASE + 200],
  );
});

// ---------------------------------------------------------------------------
// GET /api/users/:id
// ---------------------------------------------------------------------------

describe('GET /api/users/:id', () => {
  it('returns 200 and the correct user for a valid id', async () => {
    const res = await request.get(`/api/users/${user.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: user.id,
      username: user.username,
    });
  });

  it('returns the correct public fields', async () => {
    const res = await request.get(`/api/users/${user.id}`);

    expect(res.status).toBe(200);
    const u = res.body;
    expect(u.id).toBeDefined();
    expect(u.username).toBeDefined();
    expect(u.created_at).toBeDefined();
    // sensitive fields must not be exposed
    expect(u.password_hash).toBeUndefined();
    expect(u.email).toBeUndefined();
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await request.get('/api/users/00000000-0000-4000-8000-000000000000');

    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const res = await request.get('/api/users/not-a-uuid');

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/:id/reviews
// ---------------------------------------------------------------------------

describe('GET /api/users/:id/reviews', () => {
  it('returns 200 and an empty array when the user has no reviews', async () => {
    const res = await request.get(`/api/users/${user.id}/reviews`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 and all reviews for the user', async () => {
    await createReview({ userId: user.id, animeId: animeA.id, rating: 8, body: 'Great.' });
    await createReview({ userId: user.id, animeId: animeB.id, rating: 6, body: 'Decent.' });

    const res = await request.get(`/api/users/${user.id}/reviews`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('returns the correct fields on each review', async () => {
    const res = await request.get(`/api/users/${user.id}/reviews`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const review = res.body[0];
    expect(review.id).toBeDefined();
    expect(review.user_id).toBe(user.id);
    expect(review.anime_id).toBeDefined();
    expect(review.rating !== undefined).toBe(true);
    expect(review.body !== undefined).toBe(true);
    expect(review.created_at).toBeDefined();
  });

  it('does not return reviews belonging to other users', async () => {
    await createReview({ userId: otherUser.id, animeId: animeA.id, rating: 5, body: 'Meh.' });

    const res = await request.get(`/api/users/${user.id}/reviews`);

    expect(res.status).toBe(200);
    const userIds = res.body.map((r) => r.user_id);
    expect(userIds.every((id) => id === user.id)).toBe(true);
  });

  it('returns 404 for a non-existent user id', async () => {
    const res = await request.get('/api/users/00000000-0000-4000-8000-000000000000/reviews');

    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const res = await request.get('/api/users/not-a-uuid/reviews');

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/:id/watchlist
// ---------------------------------------------------------------------------

describe('GET /api/users/:id/watchlist', () => {
  it('returns 200 and an empty array when the user has no watchlist entries', async () => {
    const res = await request.get(`/api/users/${otherUser.id}/watchlist`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 and all watchlist entries for the user', async () => {
    await addToWatchlist({ userId: otherUser.id, animeId: animeA.id, status: 'watching' });
    await addToWatchlist({ userId: otherUser.id, animeId: animeB.id, status: 'completed' });

    const res = await request.get(`/api/users/${otherUser.id}/watchlist`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('returns the correct fields on each entry', async () => {
    const res = await request.get(`/api/users/${otherUser.id}/watchlist`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const entry = res.body[0];
    expect(entry.id).toBeDefined();
    expect(entry.user_id).toBe(otherUser.id);
    expect(entry.anime_id).toBeDefined();
    expect(entry.status).toBeDefined();
    expect(entry.episodes_watched).toBeDefined();
    expect(entry.updated_at).toBeDefined();
    // joined from anime table
    expect(entry.title).toBeDefined();
    expect(entry.poster_path !== undefined).toBe(true);
  });

  it('does not return entries belonging to other users', async () => {
    await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'plan_to_watch' });

    const res = await request.get(`/api/users/${otherUser.id}/watchlist`);

    expect(res.status).toBe(200);
    const userIds = res.body.map((e) => e.user_id);
    expect(userIds.every((id) => id === otherUser.id)).toBe(true);
  });

  it('returns 404 for a non-existent user id', async () => {
    const res = await request.get('/api/users/00000000-0000-4000-8000-000000000000/watchlist');

    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const res = await request.get('/api/users/not-a-uuid/watchlist');

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/:id
// ---------------------------------------------------------------------------

describe('PATCH /api/users/:id', () => {
  it('returns 200 and the updated user when the owner updates their own profile', async () => {
    const res = await request
      .patch(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'updated_username' });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('updated_username');

    // keep state consistent for remaining tests
    user.username = res.body.username;
  });

  it('does not expose sensitive fields in the response', async () => {
    const res = await request
      .patch(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ username: user.username });

    expect(res.status).toBe(200);
    expect(res.body.password_hash).toBeUndefined();
    expect(res.body.email).toBeUndefined();
  });

  it('returns 403 when a user tries to update another user\'s profile', async () => {
    const res = await request
      .patch(`/api/users/${otherUser.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'hijacked' });

    expect(res.status).toBe(403);
  });

  it('returns 400 when no updatable fields are provided', async () => {
    const res = await request
      .patch(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 400 when username is an empty string', async () => {
    const res = await request
      .patch(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ username: '   ' });

    expect(res.status).toBe(400);
  });

  it('returns 409 when username is already taken', async () => {
    const res = await request
      .patch(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ username: otherUser.username });

    expect(res.status).toBe(409);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request
      .patch(`/api/users/${user.id}`)
      .send({ username: 'no_auth' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is malformed', async () => {
    const res = await request
      .patch(`/api/users/${user.id}`)
      .set('Authorization', 'Bearer not.a.real.token')
      .send({ username: 'bad_token' });

    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-UUID id', async () => {
    const res = await request
      .patch('/api/users/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'whatever' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent user id', async () => {
    const res = await request
      .patch('/api/users/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'ghost' });

    // 403 is also acceptable here depending on whether you want to leak
    // existence — adjust if your route returns 403 instead
    expect([403, 404]).toContain(res.status);
  });
});