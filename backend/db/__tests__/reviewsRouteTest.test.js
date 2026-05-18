import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import supertest from 'supertest';
import app from '../../app.js';
import { createTestUser } from '../testHelpers.js';
import { createReview } from '../../db/reviews.js';
import { upsertAnime } from '../../db/anime.js';
import { query } from '../../db/db.js';

const request = supertest(app);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeAnime(tmdbId = 99990) {
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
// Shared state — created once, reused across all describe blocks
// ---------------------------------------------------------------------------

let user, token;
let modUser, modToken;
let otherUser, otherToken;
let anime;

beforeAll(async () => {
  [
    { user, token },
    { user: modUser, token: modToken },
    { user: otherUser, token: otherToken },
  ] = await Promise.all([
    createTestUser(),
    createTestUser({ role_type: 'moderator' }),
    createTestUser(),
  ]);
  anime = await makeAnime(99990);
});

// ---------------------------------------------------------------------------
// Cleanup — wipe reviews (and any extra test anime) between tests.
// Users and the primary anime row persist for the whole file.
// ---------------------------------------------------------------------------

afterEach(async () => {
  await query(`
    DELETE FROM reviews
    WHERE anime_id IN (
      SELECT id FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999
    )
  `);
  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 99991 AND 99999`);
});

// afterAll cleanup is intentionally left to the testHelpers pattern:
// any integration test runner should nuke testuser_%@example.com rows
// and tmdb_id 99990–99999 anime rows at suite level if needed.

// ---------------------------------------------------------------------------
// GET /api/reviews?animeId=
// ---------------------------------------------------------------------------

describe('GET /api/reviews?animeId=', () => {
  it('returns 200 and an empty array when the anime has no reviews', async () => {
    const res = await request.get(`/api/reviews?animeId=${anime.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 and all reviews for the given anime', async () => {
    await createReview({ animeId: anime.id, userId: user.id, rating: 8, body: 'Great.' });
    await createReview({ animeId: anime.id, userId: otherUser.id, rating: 6, body: 'Decent.' });

    const res = await request.get(`/api/reviews?animeId=${anime.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('returns the correct fields on each review including username', async () => {
    await createReview({ animeId: anime.id, userId: user.id, rating: 9, body: 'Loved it.' });

    const res = await request.get(`/api/reviews?animeId=${anime.id}`);
    const review = res.body[0];

    expect(review).toMatchObject({
      anime_id: anime.id,
      user_id: user.id,
      rating: 9,
      body: 'Loved it.',
      username: user.username,
    });
    expect(review.id).toBeDefined();
    expect(review.created_at).toBeDefined();
    expect(review.updated_at).toBeDefined();
  });

  it('does not return password_hash on any review', async () => {
    await createReview({ animeId: anime.id, userId: user.id, rating: 7, body: 'Good.' });

    const res = await request.get(`/api/reviews?animeId=${anime.id}`);

    expect(res.body[0].password_hash).toBeUndefined();
  });

  it('returns 200 and an empty array for a valid UUID with no matching anime', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const res = await request.get(`/api/reviews?animeId=${nonExistentId}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 400 when animeId is missing', async () => {
    const res = await request.get('/api/reviews');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when animeId is not a valid UUID', async () => {
    const res = await request.get('/api/reviews?animeId=not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('is publicly accessible without a token', async () => {
    const res = await request.get(`/api/reviews?animeId=${anime.id}`);

    expect(res.status).toBe(200);
  });

  it('only returns reviews for the requested anime, not others', async () => {
    const animeB = await makeAnime(99991);
    await createReview({ animeId: anime.id, userId: user.id, rating: 9, body: 'Anime A.' });

    const res = await request.get(`/api/reviews?animeId=${animeB.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/reviews
// ---------------------------------------------------------------------------

describe('POST /api/reviews', () => {
  function postReview(body, authToken) {
    const req = request.post('/api/reviews');
    if (authToken) req.set('Authorization', `Bearer ${authToken}`);
    return req.send(body);
  }

  describe('success', () => {
    it('creates a review and returns 201 with the new review', async () => {
      const res = await postReview(
        { animeId: anime.id, rating: 8, body: 'Really enjoyed this one.' },
        token,
      );

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        anime_id: anime.id,
        user_id: user.id,
        rating: 8,
        body: 'Really enjoyed this one.',
      });
      expect(res.body.id).toBeDefined();
      expect(res.body.created_at).toBeDefined();
    });

    it('accepts a review with only a rating (no body)', async () => {
      const res = await postReview({ animeId: anime.id, rating: 7 }, token);

      expect(res.status).toBe(201);
      expect(res.body.rating).toBe(7);
    });

    it('accepts a review with only a body (no rating)', async () => {
      const res = await postReview({ animeId: anime.id, body: 'Body-only review.' }, token);

      expect(res.status).toBe(201);
      expect(res.body.body).toBe('Body-only review.');
      expect(res.body.rating).toBeNull();
    });

    it('accepts rating = 1 (min boundary)', async () => {
      const res = await postReview({ animeId: anime.id, rating: 1 }, token);

      expect(res.status).toBe(201);
      expect(res.body.rating).toBe(1);
    });

    it('accepts rating = 10 (max boundary)', async () => {
      const res = await postReview({ animeId: anime.id, rating: 10 }, token);

      expect(res.status).toBe(201);
      expect(res.body.rating).toBe(10);
    });

    it('a moderator can create a review', async () => {
      const res = await postReview(
        { animeId: anime.id, rating: 9, body: 'Mod review.' },
        modToken,
      );

      expect(res.status).toBe(201);
      expect(res.body.user_id).toBe(modUser.id);
    });
  });

  describe('authentication', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await postReview({ animeId: anime.id, rating: 8 });

      expect(res.status).toBe(401);
    });

    it('returns 401 when the token is malformed', async () => {
      const res = await postReview({ animeId: anime.id, rating: 8 }, 'not.a.real.token');

      expect(res.status).toBe(401);
    });
  });

  describe('input validation', () => {
    it('returns 400 when animeId is missing', async () => {
      const res = await postReview({ rating: 8, body: 'No animeId.' }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when animeId is not a valid UUID', async () => {
      const res = await postReview({ animeId: 'not-a-uuid', rating: 8 }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when both rating and body are absent', async () => {
      const res = await postReview({ animeId: anime.id }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when rating is below 1', async () => {
      const res = await postReview({ animeId: anime.id, rating: 0 }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when rating is above 10', async () => {
      const res = await postReview({ animeId: anime.id, rating: 11 }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when rating is not an integer', async () => {
      const res = await postReview({ animeId: anime.id, rating: 7.5 }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when body is an empty string', async () => {
      const res = await postReview({ animeId: anime.id, body: '' }, token);

      expect(res.status).toBe(400);
    });
  });

  describe('business rules', () => {
    it('returns 409 when the user already has a review for this anime', async () => {
      const first = await postReview(
        { animeId: anime.id, rating: 8, body: 'First review.' },
        token,
      );
      expect(first.status).toBe(201);

      const second = await postReview(
        { animeId: anime.id, rating: 5, body: 'Duplicate review.' },
        token,
      );
      expect(second.status).toBe(409);
    });

    it('returns 404 when animeId is a valid UUID but does not exist', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';
      const res = await postReview({ animeId: nonExistentId, rating: 8 }, token);

      expect(res.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/reviews/:id
// ---------------------------------------------------------------------------

describe('GET /api/reviews/:id', () => {
  it('returns 200 and the review when it exists', async () => {
    const review = await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 8,
      body: 'Great show.',
    });

    const res = await request.get(`/api/reviews/${review.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: review.id,
      anime_id: anime.id,
      user_id: user.id,
      rating: 8,
      body: 'Great show.',
    });
    expect(res.body.created_at).toBeDefined();
    expect(res.body.updated_at).toBeDefined();
  });

  it('is publicly accessible without a token', async () => {
    const review = await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 7,
      body: 'Public.',
    });

    const res = await request.get(`/api/reviews/${review.id}`);

    expect(res.status).toBe(200);
  });

  it('does not expose password_hash', async () => {
    const review = await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 7,
      body: 'No hash.',
    });

    const res = await request.get(`/api/reviews/${review.id}`);

    expect(res.body.password_hash).toBeUndefined();
  });

  it('returns 404 when the review does not exist', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const res = await request.get(`/api/reviews/${nonExistentId}`);

    expect(res.status).toBe(404);
  });

  it('returns 400 when the id is not a valid UUID', async () => {
    const res = await request.get('/api/reviews/not-a-uuid');

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/reviews/:id
// ---------------------------------------------------------------------------

describe('PATCH /api/reviews/:id', () => {
  function patchReview(id, body, authToken) {
    const req = request.patch(`/api/reviews/${id}`);
    if (authToken) req.set('Authorization', `Bearer ${authToken}`);
    return req.send(body);
  }

  describe('success', () => {
    it('owner can update the rating', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 6,
        body: 'Okay.',
      });

      const res = await patchReview(review.id, { rating: 9 }, token);

      expect(res.status).toBe(200);
      expect(res.body.rating).toBe(9);
      expect(res.body.body).toBe('Okay.');
    });

    it('owner can update the body', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 6,
        body: 'Original.',
      });

      const res = await patchReview(review.id, { body: 'Updated body.' }, token);

      expect(res.status).toBe(200);
      expect(res.body.body).toBe('Updated body.');
      expect(res.body.rating).toBe(6);
    });

    it('owner can update both rating and body at once', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 5,
        body: 'Meh.',
      });

      const res = await patchReview(review.id, { rating: 10, body: 'Changed my mind!' }, token);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ rating: 10, body: 'Changed my mind!' });
    });

    it('returns the full updated review in the response', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 5,
        body: 'Fine.',
      });

      const res = await patchReview(review.id, { rating: 8 }, token);

      expect(res.body.id).toBe(review.id);
      expect(res.body.anime_id).toBe(anime.id);
      expect(res.body.user_id).toBe(user.id);
      expect(res.body.updated_at).toBeDefined();
    });
  });

  describe('authentication', () => {
    it('returns 401 with no token', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 5,
        body: 'Auth test.',
      });

      const res = await patchReview(review.id, { rating: 9 });

      expect(res.status).toBe(401);
    });

    it('returns 401 with a malformed token', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 5,
        body: 'Auth test.',
      });

      const res = await patchReview(review.id, { rating: 9 }, 'garbage.token.here');

      expect(res.status).toBe(401);
    });
  });

  describe('authorization', () => {
    it('returns 403 when a plain user tries to edit another user\'s review', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 7,
        body: 'Mine.',
      });

      const res = await patchReview(review.id, { rating: 1 }, otherToken);

      expect(res.status).toBe(403);
    });

    it('returns 403 when a moderator tries to edit someone else\'s review', async () => {
      // Moderators can delete but cannot edit other users' reviews
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 7,
        body: 'Mine.',
      });

      const res = await patchReview(review.id, { rating: 1 }, modToken);

      expect(res.status).toBe(403);
    });
  });

  describe('input validation', () => {
    it('returns 400 when the id is not a valid UUID', async () => {
      const res = await patchReview('not-a-uuid', { rating: 8 }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when rating is below 1', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 5,
        body: 'Validation.',
      });

      const res = await patchReview(review.id, { rating: 0 }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when rating is above 10', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 5,
        body: 'Validation.',
      });

      const res = await patchReview(review.id, { rating: 11 }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when rating is not an integer', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 5,
        body: 'Validation.',
      });

      const res = await patchReview(review.id, { rating: 6.5 }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when body is an empty string', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 5,
        body: 'Validation.',
      });

      const res = await patchReview(review.id, { body: '' }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when the request body has no updatable fields', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 5,
        body: 'Validation.',
      });

      const res = await patchReview(review.id, {}, token);

      expect(res.status).toBe(400);
    });
  });

  describe('not found', () => {
    it('returns 404 when the review does not exist', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';

      const res = await patchReview(nonExistentId, { rating: 8 }, token);

      expect(res.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/reviews/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/reviews/:id', () => {
  function deleteReview(id, authToken) {
    const req = request.delete(`/api/reviews/${id}`);
    if (authToken) req.set('Authorization', `Bearer ${authToken}`);
    return req;
  }

  describe('success', () => {
    it('owner can delete their own review and receives 200', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 7,
        body: 'To be deleted.',
      });

      const res = await deleteReview(review.id, token);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(review.id);
    });

    it('moderator can delete another user\'s review', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 7,
        body: 'Mod will delete.',
      });

      const res = await deleteReview(review.id, modToken);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(review.id);
    });

    it('the deleted review is no longer retrievable after deletion', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 7,
        body: 'Gone soon.',
      });

      await deleteReview(review.id, token);

      const res = await request.get(`/api/reviews/${review.id}`);
      expect(res.status).toBe(404);
    });
  });

  describe('authentication', () => {
    it('returns 401 with no token', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 7,
        body: 'Auth check.',
      });

      const res = await deleteReview(review.id);

      expect(res.status).toBe(401);
    });

    it('returns 401 with a malformed token', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 7,
        body: 'Auth check.',
      });

      const res = await deleteReview(review.id, 'bad.token.here');

      expect(res.status).toBe(401);
    });
  });

  describe('authorization', () => {
    it('returns 403 when a plain user tries to delete another user\'s review', async () => {
      const review = await createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 7,
        body: 'Mine.',
      });

      const res = await deleteReview(review.id, otherToken);

      expect(res.status).toBe(403);
    });
  });

  describe('validation and not found', () => {
    it('returns 400 when the id is not a valid UUID', async () => {
      const res = await deleteReview('not-a-uuid', token);

      expect(res.status).toBe(400);
    });

    it('returns 404 when the review does not exist', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';

      const res = await deleteReview(nonExistentId, token);

      expect(res.status).toBe(404);
    });
  });
});