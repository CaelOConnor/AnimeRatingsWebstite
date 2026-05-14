import { describe, it, expect, afterEach } from 'vitest';
import { createComment } from '../comments.js';
import { createReview } from '../reviews.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeUser(suffix = '') {
  return createUser({
    username: `comment_test_user${suffix}`,
    email: `comment_test_user${suffix}@example.com`,
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
  await query(`DELETE FROM users WHERE email LIKE 'comment_test_user%@example.com'`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createComment', () => {
  it('inserts a comment and returns the expected fields', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    const comment = await createComment({
      reviewId: review.id,
      userId: user.id,
      body: 'Great review!',
    });

    expect(comment).toMatchObject({
      review_id: review.id,
      user_id: user.id,
      body: 'Great review!',
    });
  });

  it('returns an id (UUID) on the created comment', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    const comment = await createComment({
      reviewId: review.id,
      userId: user.id,
      body: 'Nice write-up.',
    });

    expect(comment.id).toBeDefined();
    expect(typeof comment.id).toBe('string');
    expect(comment.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('returns created_at and updated_at timestamps', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    const comment = await createComment({
      reviewId: review.id,
      userId: user.id,
      body: 'Interesting take.',
    });

    expect(comment.created_at).toBeDefined();
    expect(comment.updated_at).toBeDefined();
  });

  it('allows the same user to comment multiple times on the same review', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    const commentA = await createComment({ reviewId: review.id, userId: user.id, body: 'First comment.' });
    const commentB = await createComment({ reviewId: review.id, userId: user.id, body: 'Second comment.' });

    expect(commentA.id).not.toBe(commentB.id);
    expect(commentA.body).toBe('First comment.');
    expect(commentB.body).toBe('Second comment.');
  });

  it('allows multiple users to comment on the same review', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();
    const review = await makeReview(anime.id, userA.id);

    const commentA = await createComment({ reviewId: review.id, userId: userA.id, body: 'User A comment.' });
    const commentB = await createComment({ reviewId: review.id, userId: userB.id, body: 'User B comment.' });

    expect(commentA.user_id).toBe(userA.id);
    expect(commentB.user_id).toBe(userB.id);
  });

  it('allows a user to comment on reviews for different anime', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);
    const reviewA = await makeReview(animeA.id, userA.id);
    const reviewB = await makeReview(animeB.id, userB.id);

    const commentA = await createComment({ reviewId: reviewA.id, userId: userA.id, body: 'Comment on A.' });
    const commentB = await createComment({ reviewId: reviewB.id, userId: userA.id, body: 'Comment on B.' });

    expect(commentA.review_id).toBe(reviewA.id);
    expect(commentB.review_id).toBe(reviewB.id);
  });

  it('throws a friendly error when the review does not exist', async () => {
    const user = await makeUser();
    const nonExistentReviewId = '00000000-0000-4000-8000-000000000000';

    await expect(
      createComment({ reviewId: nonExistentReviewId, userId: user.id, body: 'Orphan comment.' })
    ).rejects.toThrow(/review/i);
  });

  it('throws a friendly error when the user does not exist', async () => {
    const anime = await makeAnime();
    const user = await makeUser();
    const review = await makeReview(anime.id, user.id);
    const nonExistentUserId = '00000000-0000-4000-8000-000000000000';

    await expect(
      createComment({ reviewId: review.id, userId: nonExistentUserId, body: 'Ghost comment.' })
    ).rejects.toThrow(/user/i);
  });
});