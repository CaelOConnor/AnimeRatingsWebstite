import { describe, it, expect, afterEach } from 'vitest';
import { createReview } from '../reviews.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
const _prefix = 'rv_cr';

async function makeUser(suffix = '') {
  const uid = `${Date.now() % 1000000}_${++_seq}`;
  return createUser({
    username:     `${_prefix}_${uid}${suffix}`,
    email:        `${_prefix}_${uid}${suffix}@example.com`,
    passwordHash: 'hashed_pw',
  });
}

async function makeAnime(tmdbId = 10120) {
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

afterEach(async () => {
  await query(`DELETE FROM users WHERE email LIKE '${_prefix}_%@example.com'`);
  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 10120 AND 10129`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createReview', () => {
  it('inserts a review and returns the expected fields', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const review = await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 8,
      body: 'Really enjoyed this one.',
    });

    expect(review).toMatchObject({
      anime_id: anime.id,
      user_id: user.id,
      rating: '8.00',
      body: 'Really enjoyed this one.',
    });
  });

  it('returns an id (UUID) on the created review', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const review = await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 7,
      body: 'Solid show.',
    });

    expect(review.id).toBeDefined();
    expect(typeof review.id).toBe('string');
    // UUID v4 shape
    expect(review.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('returns created_at and updated_at timestamps', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const review = await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 6,
      body: 'Decent.',
    });

    expect(review.created_at).toBeDefined();
    expect(review.updated_at).toBeDefined();
  });

  it('accepts a null body (rating-only review)', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const review = await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 9,
      body: null,
    });

    expect(review.rating).toBe('9.00');
    expect(review.body).toBeNull();
  });

  it('accepts boundary rating of 1', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const review = await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 1,
      body: 'Painful watch.',
    });

    expect(review.rating).toBe('1.00');
  });

  it('accepts boundary rating of 10', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const review = await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 10,
      body: 'Masterpiece.',
    });

    expect(review.rating).toBe('10.00');
  });

  it('throws a friendly error when the same user reviews the same anime twice', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 7,
      body: 'First review.',
    });

    await expect(
      createReview({
        animeId: anime.id,
        userId: user.id,
        rating: 5,
        body: 'Trying to review again.',
      })
    ).rejects.toThrow(/already reviewed/i);
  });

  it('allows two different users to review the same anime', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();

    const reviewA = await createReview({
      animeId: anime.id,
      userId: userA.id,
      rating: 8,
      body: 'Great show.',
    });

    const reviewB = await createReview({
      animeId: anime.id,
      userId: userB.id,
      rating: 6,
      body: 'It was okay.',
    });

    expect(reviewA.user_id).toBe(userA.id);
    expect(reviewB.user_id).toBe(userB.id);
  });

  it('allows the same user to review two different anime', async () => {
    const user = await makeUser();
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);

    const reviewA = await createReview({
      animeId: animeA.id,
      userId: user.id,
      rating: 9,
      body: 'Loved it.',
    });

    const reviewB = await createReview({
      animeId: animeB.id,
      userId: user.id,
      rating: 4,
      body: 'Not for me.',
    });

    expect(reviewA.anime_id).toBe(animeA.id);
    expect(reviewB.anime_id).toBe(animeB.id);
  });
});