import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import supertest from 'supertest';
import app from '../../app.js';
import { createTestUser } from './testHelpers.js';
import { createReview } from '../../db/reviews.js';
import { createComment } from '../../db/comments.js';
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
let review; // a review owned by `user` that comments hang off of

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

  anime = await makeAnime(99994);
  review = await createReview({ animeId: anime.id, userId: user.id, rating: 8, body: 'Good.' });
});

// ---------------------------------------------------------------------------
// Cleanup — wipe comments between tests; everything else persists.
// ---------------------------------------------------------------------------

afterEach(async () => {
  await query(`DELETE FROM comments WHERE review_id = $1`, [review.id]);
});

// ---------------------------------------------------------------------------
// GET /api/comments?reviewId=
// ---------------------------------------------------------------------------

describe('GET /api/comments?reviewId=', () => {
  it('returns 200 and an empty array when the review has no comments', async () => {
    const res = await request.get(`/api/comments?reviewId=${review.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 and all comments for the given review', async () => {
    await createComment({ reviewId: review.id, userId: user.id, body: 'First.' });
    await createComment({ reviewId: review.id, userId: otherUser.id, body: 'Second.' });

    const res = await request.get(`/api/comments?reviewId=${review.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('returns comments ordered by created_at ascending', async () => {
    await createComment({ reviewId: review.id, userId: user.id, body: 'Earlier.' });
    await createComment({ reviewId: review.id, userId: otherUser.id, body: 'Later.' });

    const res = await request.get(`/api/comments?reviewId=${review.id}`);

    expect(res.body[0].body).toBe('Earlier.');
    expect(res.body[1].body).toBe('Later.');
  });

  it('returns the correct fields on each comment including username', async () => {
    await createComment({ reviewId: review.id, userId: user.id, body: 'Check fields.' });

    const res = await request.get(`/api/comments?reviewId=${review.id}`);
    const comment = res.body[0];

    expect(comment).toMatchObject({
      review_id: review.id,
      user_id: user.id,
      body: 'Check fields.',
      username: user.username,
    });
    expect(comment.id).toBeDefined();
    expect(comment.created_at).toBeDefined();
    expect(comment.updated_at).toBeDefined();
  });

  it('does not expose password_hash on any comment', async () => {
    await createComment({ reviewId: review.id, userId: user.id, body: 'No hash.' });

    const res = await request.get(`/api/comments?reviewId=${review.id}`);

    expect(res.body[0].password_hash).toBeUndefined();
  });

  it('returns 200 and an empty array for a valid UUID with no matching review', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const res = await request.get(`/api/comments?reviewId=${nonExistentId}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('is publicly accessible without a token', async () => {
    const res = await request.get(`/api/comments?reviewId=${review.id}`);

    expect(res.status).toBe(200);
  });

  it('returns 400 when reviewId is missing', async () => {
    const res = await request.get('/api/comments');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when reviewId is not a valid UUID', async () => {
    const res = await request.get('/api/comments?reviewId=not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/comments
// ---------------------------------------------------------------------------

describe('POST /api/comments', () => {
  function postComment(body, authToken) {
    const req = request.post('/api/comments');
    if (authToken) req.set('Authorization', `Bearer ${authToken}`);
    return req.send(body);
  }

  describe('success', () => {
    it('creates a comment and returns 201 with the new comment', async () => {
      const res = await postComment(
        { reviewId: review.id, body: 'Great review!' },
        token,
      );

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        review_id: review.id,
        user_id: user.id,
        body: 'Great review!',
      });
      expect(res.body.id).toBeDefined();
      expect(res.body.created_at).toBeDefined();
    });

    it('another user can comment on the same review', async () => {
      const res = await postComment(
        { reviewId: review.id, body: 'I agree!' },
        otherToken,
      );

      expect(res.status).toBe(201);
      expect(res.body.user_id).toBe(otherUser.id);
    });

    it('a moderator can post a comment', async () => {
      const res = await postComment(
        { reviewId: review.id, body: 'Mod comment.' },
        modToken,
      );

      expect(res.status).toBe(201);
      expect(res.body.user_id).toBe(modUser.id);
    });

    it('the same user can post multiple comments on the same review', async () => {
      const first = await postComment({ reviewId: review.id, body: 'First comment.' }, token);
      const second = await postComment({ reviewId: review.id, body: 'Second comment.' }, token);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
    });
  });

  describe('authentication', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await postComment({ reviewId: review.id, body: 'No auth.' });

      expect(res.status).toBe(401);
    });

    it('returns 401 when the token is malformed', async () => {
      const res = await postComment(
        { reviewId: review.id, body: 'Bad token.' },
        'not.a.real.token',
      );

      expect(res.status).toBe(401);
    });
  });

  describe('input validation', () => {
    it('returns 400 when reviewId is missing', async () => {
      const res = await postComment({ body: 'No reviewId.' }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when reviewId is not a valid UUID', async () => {
      const res = await postComment({ reviewId: 'not-a-uuid', body: 'Bad id.' }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when body is missing', async () => {
      const res = await postComment({ reviewId: review.id }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when body is an empty string', async () => {
      const res = await postComment({ reviewId: review.id, body: '' }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when body is whitespace only', async () => {
      const res = await postComment({ reviewId: review.id, body: '   ' }, token);

      expect(res.status).toBe(400);
    });
  });

  describe('business rules', () => {
    it('returns 404 when reviewId is a valid UUID but does not exist', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';
      const res = await postComment({ reviewId: nonExistentId, body: 'Ghost review.' }, token);

      expect(res.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/comments/:id
// ---------------------------------------------------------------------------

describe('PATCH /api/comments/:id', () => {
  function patchComment(id, body, authToken) {
    const req = request.patch(`/api/comments/${id}`);
    if (authToken) req.set('Authorization', `Bearer ${authToken}`);
    return req.send(body);
  }

  describe('success', () => {
    it('owner can update the body and receives 200', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'Original body.',
      });

      const res = await patchComment(comment.id, { body: 'Updated body.' }, token);

      expect(res.status).toBe(200);
      expect(res.body.body).toBe('Updated body.');
    });

    it('returns the full updated comment in the response', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'Check response shape.',
      });

      const res = await patchComment(comment.id, { body: 'New body.' }, token);

      expect(res.body.id).toBe(comment.id);
      expect(res.body.review_id).toBe(review.id);
      expect(res.body.user_id).toBe(user.id);
      expect(res.body.updated_at).toBeDefined();
    });
  });

  describe('authentication', () => {
    it('returns 401 with no token', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'Auth check.',
      });

      const res = await patchComment(comment.id, { body: 'Sneaky.' });

      expect(res.status).toBe(401);
    });

    it('returns 401 with a malformed token', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'Auth check.',
      });

      const res = await patchComment(comment.id, { body: 'Sneaky.' }, 'bad.token.here');

      expect(res.status).toBe(401);
    });
  });

  describe('authorization', () => {
    it('returns 403 when a plain user tries to edit another user\'s comment', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'Mine.',
      });

      const res = await patchComment(comment.id, { body: 'Not yours.' }, otherToken);

      expect(res.status).toBe(403);
    });

    it('returns 403 when a moderator tries to edit another user\'s comment', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'Mine.',
      });

      const res = await patchComment(comment.id, { body: 'Mod edit.' }, modToken);

      expect(res.status).toBe(403);
    });
  });

  describe('input validation', () => {
    it('returns 400 when the id is not a valid UUID', async () => {
      const res = await patchComment('not-a-uuid', { body: 'Whatever.' }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when body is missing', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'Validation.',
      });

      const res = await patchComment(comment.id, {}, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when body is an empty string', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'Validation.',
      });

      const res = await patchComment(comment.id, { body: '' }, token);

      expect(res.status).toBe(400);
    });

    it('returns 400 when body is whitespace only', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'Validation.',
      });

      const res = await patchComment(comment.id, { body: '   ' }, token);

      expect(res.status).toBe(400);
    });
  });

  describe('not found', () => {
    it('returns 404 when the comment does not exist', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';

      const res = await patchComment(nonExistentId, { body: 'Ghost.' }, token);

      expect(res.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/comments/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/comments/:id', () => {
  function deleteComment(id, authToken) {
    const req = request.delete(`/api/comments/${id}`);
    if (authToken) req.set('Authorization', `Bearer ${authToken}`);
    return req;
  }

  describe('success', () => {
    it('owner can delete their own comment and receives 200', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'To be deleted.',
      });

      const res = await deleteComment(comment.id, token);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(comment.id);
    });

    it('moderator can delete another user\'s comment', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'Mod will delete.',
      });

      const res = await deleteComment(comment.id, modToken);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(comment.id);
    });

    it('the deleted comment no longer appears in GET /api/comments?reviewId=', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'Gone soon.',
      });

      await deleteComment(comment.id, token);

      const res = await request.get(`/api/comments?reviewId=${review.id}`);
      const ids = res.body.map((c) => c.id);
      expect(ids).not.toContain(comment.id);
    });
  });

  describe('authentication', () => {
    it('returns 401 with no token', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'Auth check.',
      });

      const res = await deleteComment(comment.id);

      expect(res.status).toBe(401);
    });

    it('returns 401 with a malformed token', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'Auth check.',
      });

      const res = await deleteComment(comment.id, 'bad.token.here');

      expect(res.status).toBe(401);
    });
  });

  describe('authorization', () => {
    it('returns 403 when a plain user tries to delete another user\'s comment', async () => {
      const comment = await createComment({
        reviewId: review.id,
        userId: user.id,
        body: 'Mine.',
      });

      const res = await deleteComment(comment.id, otherToken);

      expect(res.status).toBe(403);
    });
  });

  describe('validation and not found', () => {
    it('returns 400 when the id is not a valid UUID', async () => {
      const res = await deleteComment('not-a-uuid', token);

      expect(res.status).toBe(400);
    });

    it('returns 404 when the comment does not exist', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';

      const res = await deleteComment(nonExistentId, token);

      expect(res.status).toBe(404);
    });
  });
});