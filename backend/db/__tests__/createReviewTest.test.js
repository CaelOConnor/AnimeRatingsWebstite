import { describe, it, expect, afterEach } from 'vitest';
import { createReview } from '../reviews.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeUser(suffix = '') {
  return createUser({
    username: `review_test_user${suffix}`,
    email: `review_test_user${suffix}@example.com`,
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

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(async () => {
  // Delete reviews whose anime is in the test tmdbId range
  await query(`
    DELETE FROM reviews
    WHERE anime_id IN (
      SELECT id FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999
    )
  `);
  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999`);
  await query(`DELETE FROM users WHERE email LIKE 'review_test_user%@example.com'`);
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
      rating: 8,
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

    expect(review.rating).toBe(9);
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

    expect(review.rating).toBe(1);
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

    expect(review.rating).toBe(10);
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