import { describe, it, expect, afterEach } from 'vitest';
import { getReviewsByUserId, createReview } from '../reviews.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
const _prefix = 'rv_usr'; 

async function makeUser(suffix = '') {
  const uid = `${Date.now() % 1000000}_${++_seq}`;
  return createUser({
    username: `${_prefix}_${uid}${suffix}`,
    email:    `${_prefix}_${uid}${suffix}@example.com`,
    passwordHash: 'hashed_pw',
  });
}

async function makeAnime(tmdbId = 10230) {
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
// Cleanup
// ---------------------------------------------------------------------------

afterEach(async () => {
  await query(`DELETE FROM users WHERE email LIKE '${_prefix}_%@example.com'`);

  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 10230 AND 10239`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getReviewsByUserId', () => {
  it('returns an empty array when the user has no reviews', async () => {
    const user = await makeUser();

    const reviews = await getReviewsByUserId(user.id);

    expect(reviews).toEqual([]);
  });

  it('returns a single review when the user has reviewed one anime', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await createReview({ animeId: anime.id, userId: user.id, rating: 8, body: 'Great.' });

    const reviews = await getReviewsByUserId(user.id);

    expect(reviews).toHaveLength(1);
  });

  it('returns all reviews when the user has reviewed multiple anime', async () => {
    const user = await makeUser();
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);
    const animeC = await makeAnime(99992);

    await createReview({ animeId: animeA.id, userId: user.id, rating: 9, body: 'Loved it.' });
    await createReview({ animeId: animeB.id, userId: user.id, rating: 6, body: 'It was okay.' });
    await createReview({ animeId: animeC.id, userId: user.id, rating: 3, body: 'Not for me.' });

    const reviews = await getReviewsByUserId(user.id);

    expect(reviews).toHaveLength(3);
  });

  it('returns the correct fields on each review', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await createReview({ animeId: anime.id, userId: user.id, rating: 7, body: 'Solid.' });

    const reviews = await getReviewsByUserId(user.id);
    const review = reviews[0];

    expect(review).toMatchObject({
      anime_id: anime.id,
      user_id: user.id,
      rating: '7.00',
      body: 'Solid.',
    });
    expect(review.id).toBeDefined();
    expect(review.created_at).toBeDefined();
    expect(review.updated_at).toBeDefined();
  });

  it('joins and returns the anime title from the anime table', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await createReview({ animeId: anime.id, userId: user.id, rating: 8, body: 'Good.' });

    const reviews = await getReviewsByUserId(user.id);

    expect(reviews[0].title).toBe(anime.title);
  });

  it('only returns reviews belonging to the requested user, not others', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);

    await createReview({ animeId: animeA.id, userId: userA.id, rating: 9, body: 'For user A.' });
    await createReview({ animeId: animeB.id, userId: userB.id, rating: 4, body: 'For user B.' });

    const reviews = await getReviewsByUserId(userA.id);

    expect(reviews).toHaveLength(1);
    expect(reviews[0].user_id).toBe(userA.id);
  });

  it('returns an empty array for a valid UUID that does not exist', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const reviews = await getReviewsByUserId(nonExistentId);

    expect(reviews).toEqual([]);
  });

  it('does not return password_hash on any review', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await createReview({ animeId: anime.id, userId: user.id, rating: 5, body: 'Mid.' });

    const reviews = await getReviewsByUserId(user.id);

    expect(reviews[0].password_hash).toBeUndefined();
  });

  it('handles a review with a null body correctly', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await createReview({ animeId: anime.id, userId: user.id, rating: 7, body: null });

    const reviews = await getReviewsByUserId(user.id);

    expect(reviews[0].body).toBeNull();
  });
});