import { describe, it, expect, afterEach } from 'vitest';
import { getCommentsByReviewId, createComment } from '../comments.js';
import { createReview } from '../reviews.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeUser(suffix = '') {
  return createUser({
    username: `com_byreviewid_user${suffix}`,
    email: `com_byreviewid_user${suffix}@example.com`,
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
  await query(`DELETE FROM users WHERE email LIKE 'com_byreviewid_user%@example.com'`);
  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getCommentsByReviewId', () => {
  it('returns an empty array when the review has no comments', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    const comments = await getCommentsByReviewId(review.id);

    expect(comments).toEqual([]);
  });

  it('returns a single comment when the review has one', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    await createComment({ reviewId: review.id, userId: user.id, body: 'Great review!' });

    const comments = await getCommentsByReviewId(review.id);

    expect(comments).toHaveLength(1);
  });

  it('returns all comments when a review has multiple', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const userC = await makeUser('_c');
    const anime = await makeAnime();
    const review = await makeReview(anime.id, userA.id);

    await createComment({ reviewId: review.id, userId: userA.id, body: 'First.' });
    await createComment({ reviewId: review.id, userId: userB.id, body: 'Second.' });
    await createComment({ reviewId: review.id, userId: userC.id, body: 'Third.' });

    const comments = await getCommentsByReviewId(review.id);

    expect(comments).toHaveLength(3);
  });

  it('returns the correct fields on each comment', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    await createComment({ reviewId: review.id, userId: user.id, body: 'Nice one.' });

    const comments = await getCommentsByReviewId(review.id);
    const comment = comments[0];

    expect(comment).toMatchObject({
      review_id: review.id,
      user_id: user.id,
      body: 'Nice one.',
    });
    expect(comment.id).toBeDefined();
    expect(comment.created_at).toBeDefined();
    expect(comment.updated_at).toBeDefined();
  });

  it('joins and returns the username from the users table', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    await createComment({ reviewId: review.id, userId: user.id, body: 'Good stuff.' });

    const comments = await getCommentsByReviewId(review.id);

    expect(comments[0].username).toBe(user.username);
  });

  it('does not return password_hash on any comment', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    await createComment({ reviewId: review.id, userId: user.id, body: 'Interesting.' });

    const comments = await getCommentsByReviewId(review.id);

    expect(comments[0].password_hash).toBeUndefined();
  });

  it('only returns comments for the requested review, not others', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);
    const reviewA = await makeReview(animeA.id, userA.id);
    const reviewB = await makeReview(animeB.id, userB.id);

    await createComment({ reviewId: reviewA.id, userId: userA.id, body: 'Comment on A.' });
    await createComment({ reviewId: reviewB.id, userId: userB.id, body: 'Comment on B.' });

    const comments = await getCommentsByReviewId(reviewA.id);

    expect(comments).toHaveLength(1);
    expect(comments[0].review_id).toBe(reviewA.id);
  });

  it('returns an empty array for a valid UUID that does not exist', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const comments = await getCommentsByReviewId(nonExistentId);

    expect(comments).toEqual([]);
  });

  it('includes comments from multiple users each with their correct username', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();
    const review = await makeReview(anime.id, userA.id);

    await createComment({ reviewId: review.id, userId: userA.id, body: 'User A comment.' });
    await createComment({ reviewId: review.id, userId: userB.id, body: 'User B comment.' });

    const comments = await getCommentsByReviewId(review.id);
    const usernameA = comments.find((c) => c.user_id === userA.id)?.username;
    const usernameB = comments.find((c) => c.user_id === userB.id)?.username;

    expect(usernameA).toBe(userA.username);
    expect(usernameB).toBe(userB.username);
  });
});