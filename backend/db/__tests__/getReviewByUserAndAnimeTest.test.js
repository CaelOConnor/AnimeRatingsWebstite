import { describe, it, expect, afterEach } from 'vitest';
import { getReviewByUserAndAnime, createReview } from '../reviews.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeUser(suffix = '') {
  return createUser({
    username: `rev_byuseranime_user${suffix}`,
    email: `rev_byuseranime_user${suffix}@example.com`,
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
  await query(`DELETE FROM users WHERE email LIKE 'rev_byuseranime_user%@example.com'`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getReviewByUserAndAnime', () => {
  it('returns the review when the user has reviewed that anime', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const created = await createReview({ animeId: anime.id, userId: user.id, rating: 8, body: 'Loved it.' });

    const review = await getReviewByUserAndAnime(user.id, anime.id);

    expect(review).toMatchObject({
      id: created.id,
      user_id: user.id,
      anime_id: anime.id,
      rating: 8,
      body: 'Loved it.',
    });
  });

  it('returns all expected fields', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    await createReview({ animeId: anime.id, userId: user.id, rating: 7, body: 'Solid.' });

    const review = await getReviewByUserAndAnime(user.id, anime.id);

    expect(review.id).toBeDefined();
    expect(review.anime_id).toBeDefined();
    expect(review.user_id).toBeDefined();
    expect(review.rating).toBeDefined();
    expect(review.created_at).toBeDefined();
    expect(review.updated_at).toBeDefined();
  });

  it('returns null when the user has not reviewed that anime', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const review = await getReviewByUserAndAnime(user.id, anime.id);

    expect(review).toBeNull();
  });

  it('returns null when the user does not exist', async () => {
    const anime = await makeAnime();
    const nonExistentUserId = '00000000-0000-4000-8000-000000000000';

    const review = await getReviewByUserAndAnime(nonExistentUserId, anime.id);

    expect(review).toBeNull();
  });

  it('returns null when the anime does not exist', async () => {
    const user = await makeUser();
    const nonExistentAnimeId = '00000000-0000-4000-8000-000000000000';

    const review = await getReviewByUserAndAnime(user.id, nonExistentAnimeId);

    expect(review).toBeNull();
  });

  it('returns null for an invalid user UUID', async () => {
    const anime = await makeAnime();

    const review = await getReviewByUserAndAnime('not-a-uuid', anime.id);

    expect(review).toBeNull();
  });

  it('returns null for an invalid anime UUID', async () => {
    const user = await makeUser();

    const review = await getReviewByUserAndAnime(user.id, 'not-a-uuid');

    expect(review).toBeNull();
  });

  it('returns the correct review when multiple users have reviewed the same anime', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();

    await createReview({ animeId: anime.id, userId: userA.id, rating: 9, body: 'User A review.' });
    await createReview({ animeId: anime.id, userId: userB.id, rating: 4, body: 'User B review.' });

    const review = await getReviewByUserAndAnime(userB.id, anime.id);

    expect(review.user_id).toBe(userB.id);
    expect(review.body).toBe('User B review.');
  });

  it('returns the correct review when the user has reviewed multiple anime', async () => {
    const user = await makeUser();
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);

    await createReview({ animeId: animeA.id, userId: user.id, rating: 9, body: 'Anime A review.' });
    await createReview({ animeId: animeB.id, userId: user.id, rating: 3, body: 'Anime B review.' });

    const review = await getReviewByUserAndAnime(user.id, animeB.id);

    expect(review.anime_id).toBe(animeB.id);
    expect(review.body).toBe('Anime B review.');
  });

  it('handles a review with a null body correctly', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    await createReview({ animeId: anime.id, userId: user.id, rating: 6, body: null });

    const review = await getReviewByUserAndAnime(user.id, anime.id);

    expect(review.body).toBeNull();
  });
});