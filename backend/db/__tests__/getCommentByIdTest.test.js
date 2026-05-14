import { describe, it, expect, afterEach } from 'vitest';
import { getCommentById, createComment } from '../comments.js';
import { createReview } from '../reviews.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeUser(suffix = '') {
  return createUser({
    username: `com_byid_user${suffix}`,
    email: `com_byid_user${suffix}@example.com`,
    passwordHash: 'hashed_pw',
  });
}

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

async function makeReview(animeId, userId) {
  return createReview({ animeId, userId, rating: 7, body: 'A review.' });
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(async () => {
  await query(`
    DELETE FROM comments
    WHERE review_id IN (
      SELECT r.id FROM reviews r
      JOIN anime a ON r.anime_id = a.id
      WHERE a.tmdb_id BETWEEN 99990 AND 99999
    )
  `);
  await query(`
    DELETE FROM reviews
    WHERE anime_id IN (
      SELECT id FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999
    )
  `);
  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999`);
  await query(`DELETE FROM users WHERE email LIKE 'com_byid_user%@example.com'`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getCommentById', () => {
  it('returns the correct comment by id', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);
    const created = await createComment({ reviewId: review.id, userId: user.id, body: 'Great review!' });

    const comment = await getCommentById(created.id);

    expect(comment).toMatchObject({
      id: created.id,
      review_id: review.id,
      user_id: user.id,
      body: 'Great review!',
    });
  });

  it('returns all expected fields', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);
    const created = await createComment({ reviewId: review.id, userId: user.id, body: 'Nice.' });

    const comment = await getCommentById(created.id);

    expect(comment.id).toBeDefined();
    expect(comment.review_id).toBeDefined();
    expect(comment.user_id).toBeDefined();
    expect(comment.body).toBeDefined();
    expect(comment.created_at).toBeDefined();
    expect(comment.updated_at).toBeDefined();
  });

  it('returns null for a valid UUID that does not exist', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const comment = await getCommentById(nonExistentId);

    expect(comment).toBeNull();
  });

  it('returns null for an invalid UUID', async () => {
    const comment = await getCommentById('not-a-uuid');

    expect(comment).toBeNull();
  });

  it('returns the correct comment when multiple comments exist on the same review', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    await createComment({ reviewId: review.id, userId: user.id, body: 'First comment.' });
    const second = await createComment({ reviewId: review.id, userId: user.id, body: 'Second comment.' });

    const comment = await getCommentById(second.id);

    expect(comment.id).toBe(second.id);
    expect(comment.body).toBe('Second comment.');
  });
});