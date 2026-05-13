import { describe, it, expect, afterEach } from 'vitest';
import { deleteReview, createReview, getReviewById } from '../reviews.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeUser(suffix = '') {
  return createUser({
    username: `rev_delete_user${suffix}`,
    email: `rev_delete_user${suffix}@example.com`,
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
  await query(`DELETE FROM users WHERE email LIKE 'rev_delete_user%@example.com'`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deleteReview', () => {
  it('deletes the review so it can no longer be fetched', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await createReview({ animeId: anime.id, userId: user.id, rating: 7, body: 'Good.' });

    await deleteReview(review.id);

    const fetched = await getReviewById(review.id);
    expect(fetched).toBeNull();
  });

  it('returns the deleted review row', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await createReview({ animeId: anime.id, userId: user.id, rating: 8, body: 'Great.' });

    const deleted = await deleteReview(review.id);

    expect(deleted).toMatchObject({
      id: review.id,
      anime_id: anime.id,
      user_id: user.id,
      rating: 8,
      body: 'Great.',
    });
  });

  it('only deletes the targeted review, not others', async () => {
    const user = await makeUser();
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);
    const reviewA = await createReview({ animeId: animeA.id, userId: user.id, rating: 9, body: 'Anime A.' });
    const reviewB = await createReview({ animeId: animeB.id, userId: user.id, rating: 5, body: 'Anime B.' });

    await deleteReview(reviewA.id);

    const fetched = await getReviewById(reviewB.id);
    expect(fetched).not.toBeNull();
    expect(fetched.id).toBe(reviewB.id);
  });

  it('returns null for a valid UUID that does not exist', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const deleted = await deleteReview(nonExistentId);

    expect(deleted).toBeNull();
  });

  it('returns null for an invalid UUID', async () => {
    const deleted = await deleteReview('not-a-uuid');

    expect(deleted).toBeNull();
  });

  it('calling deleteReview twice on the same id returns null the second time', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await createReview({ animeId: anime.id, userId: user.id, rating: 6, body: 'Fine.' });

    await deleteReview(review.id);
    const second = await deleteReview(review.id);

    expect(second).toBeNull();
  });
});