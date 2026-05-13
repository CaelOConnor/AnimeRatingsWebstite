import { describe, it, expect, afterEach } from 'vitest';
import { getReviewById, createReview } from '../reviews.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeUser(suffix = '') {
  return createUser({
    username: `rev_byid_user${suffix}`,
    email: `rev_byid_user${suffix}@example.com`,
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
  await query(`
    DELETE FROM reviews
    WHERE anime_id IN (
      SELECT id FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999
    )
  `);
  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999`);
  await query(`DELETE FROM users WHERE email LIKE 'rev_byid_user%@example.com'`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getReviewById', () => {
  it('returns the correct review by id', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const created = await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 8,
      body: 'Really good.',
    });

    const review = await getReviewById(created.id);

    expect(review).toMatchObject({
      id: created.id,
      anime_id: anime.id,
      user_id: user.id,
      rating: 8,
      body: 'Really good.',
    });
  });

  it('returns all expected fields', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const created = await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 7,
      body: 'Solid.',
    });

    const review = await getReviewById(created.id);

    expect(review.id).toBeDefined();
    expect(review.anime_id).toBeDefined();
    expect(review.user_id).toBeDefined();
    expect(review.rating).toBeDefined();
    expect(review.created_at).toBeDefined();
    expect(review.updated_at).toBeDefined();
  });

  it('returns null for a valid UUID that does not exist', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const review = await getReviewById(nonExistentId);

    expect(review).toBeNull();
  });

  it('returns null for an invalid UUID', async () => {
    const review = await getReviewById('not-a-uuid');

    expect(review).toBeNull();
  });

  it('does not return another user\'s review when looking up by id', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();

    await createReview({ animeId: anime.id, userId: userA.id, rating: 9, body: 'User A review.' });
    const reviewB = await createReview({ animeId: anime.id, userId: userB.id, rating: 4, body: 'User B review.' });

    const review = await getReviewById(reviewB.id);

    expect(review.id).toBe(reviewB.id);
    expect(review.user_id).toBe(userB.id);
    expect(review.body).toBe('User B review.');
  });

  it('handles a review with a null body correctly', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const created = await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 6,
      body: null,
    });

    const review = await getReviewById(created.id);

    expect(review.body).toBeNull();
  });
});