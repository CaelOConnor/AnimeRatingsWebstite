import { describe, it, expect, afterEach } from 'vitest';
import { getCommentsByUserId, createComment } from '../comments.js';
import { createReview } from '../reviews.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
const _prefix = 'cm_usr'; 

async function makeUser(suffix = '') {
  const uid = `${Date.now() % 1000000}_${++_seq}`;
  return createUser({
    username: `${_prefix}_${uid}${suffix}`,
    email:    `${_prefix}_${uid}${suffix}@example.com`,
    passwordHash: 'hashed_pw',
  });
}

async function makeAnime(tmdbId = 10190) {
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
  await query(`DELETE FROM users WHERE email LIKE '${_prefix}_%@example.com'`);

  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 10190 AND 10199`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getCommentsByUserId', () => {
  it('returns an empty array when the user has no comments', async () => {
    const user = await makeUser();

    const comments = await getCommentsByUserId(user.id);

    expect(comments).toEqual([]);
  });

  it('returns a single comment when the user has commented once', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();
    const review = await makeReview(anime.id, userA.id);

    await createComment({ reviewId: review.id, userId: userB.id, body: 'Nice review.' });

    const comments = await getCommentsByUserId(userB.id);

    expect(comments).toHaveLength(1);
  });

  it('returns all comments when the user has commented multiple times', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);
    const reviewA = await makeReview(animeA.id, userA.id);
    const reviewB = await makeReview(animeB.id, userA.id);

    await createComment({ reviewId: reviewA.id, userId: userB.id, body: 'First.' });
    await createComment({ reviewId: reviewA.id, userId: userB.id, body: 'Second.' });
    await createComment({ reviewId: reviewB.id, userId: userB.id, body: 'Third.' });

    const comments = await getCommentsByUserId(userB.id);

    expect(comments).toHaveLength(3);
  });

  it('returns the correct fields on each comment', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();
    const review = await makeReview(anime.id, userA.id);

    await createComment({ reviewId: review.id, userId: userB.id, body: 'Great write-up.' });

    const comments = await getCommentsByUserId(userB.id);
    const comment = comments[0];

    expect(comment).toMatchObject({
      review_id: review.id,
      user_id: userB.id,
      body: 'Great write-up.',
    });
    expect(comment.id).toBeDefined();
    expect(comment.created_at).toBeDefined();
    expect(comment.updated_at).toBeDefined();
  });

  it('joins and returns the review body from the reviews table', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();
    const review = await makeReview(anime.id, userA.id);

    await createComment({ reviewId: review.id, userId: userB.id, body: 'Agreed.' });

    const comments = await getCommentsByUserId(userB.id);

    expect(comments[0].review_body).toBe(review.body);
  });

  it('only returns comments belonging to the requested user, not others', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();
    const review = await makeReview(anime.id, userA.id);

    await createComment({ reviewId: review.id, userId: userA.id, body: 'User A comment.' });
    await createComment({ reviewId: review.id, userId: userB.id, body: 'User B comment.' });

    const comments = await getCommentsByUserId(userA.id);

    expect(comments).toHaveLength(1);
    expect(comments[0].user_id).toBe(userA.id);
  });

  it('returns an empty array for a valid UUID that does not exist', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const comments = await getCommentsByUserId(nonExistentId);

    expect(comments).toEqual([]);
  });

  it('does not return password_hash on any comment', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();
    const review = await makeReview(anime.id, userA.id);

    await createComment({ reviewId: review.id, userId: userB.id, body: 'Good stuff.' });

    const comments = await getCommentsByUserId(userB.id);

    expect(comments[0].password_hash).toBeUndefined();
  });

  it('includes comments on reviews the user did not write themselves', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();
    const review = await makeReview(anime.id, userA.id);

    await createComment({ reviewId: review.id, userId: userB.id, body: 'Commenting on someone elses review.' });

    const comments = await getCommentsByUserId(userB.id);

    expect(comments).toHaveLength(1);
    expect(comments[0].review_id).toBe(review.id);
  });
});