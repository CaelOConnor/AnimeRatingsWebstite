import { describe, it, expect, afterEach } from 'vitest';
import { updateReview, createReview, getReviewById } from '../reviews.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
const _prefix = 'rv_upd'; 

async function makeUser(suffix = '') {
  const uid = `${Date.now() % 1000000}_${++_seq}`;
  return createUser({
    username: `${_prefix}_${uid}${suffix}`,
    email:    `${_prefix}_${uid}${suffix}@example.com`,
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

async function makeReview(animeId, userId, rating = 7, body = 'Original body.') {
  return createReview({ animeId, userId, rating, body });
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(async () => {
  await query(`DELETE FROM users WHERE email LIKE '${_prefix}_%@example.com'`);

  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('updateReview', () => {
  it('updates the rating when only rating is provided', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    const updated = await updateReview(review.id, { rating: 10 });

    expect(updated.rating).toBe(10);
    expect(updated.body).toBe('Original body.');
  });

  it('updates the body when only body is provided', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    const updated = await updateReview(review.id, { body: 'Updated body.' });

    expect(updated.body).toBe('Updated body.');
    expect(updated.rating).toBe(7);
  });

  it('updates both rating and body when both are provided', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    const updated = await updateReview(review.id, { rating: 9, body: 'Much better on rewatch.' });

    expect(updated.rating).toBe(9);
    expect(updated.body).toBe('Much better on rewatch.');
  });

  it('returns the full review row after update', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    const updated = await updateReview(review.id, { rating: 5 });

    expect(updated.id).toBe(review.id);
    expect(updated.anime_id).toBe(anime.id);
    expect(updated.user_id).toBe(user.id);
    expect(updated.created_at).toBeDefined();
    expect(updated.updated_at).toBeDefined();
  });

  it('updated_at is more recent than created_at after update', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    // Small delay so the trigger timestamp is measurably different
    await new Promise((res) => setTimeout(res, 50));

    const updated = await updateReview(review.id, { rating: 3 });

    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
      new Date(updated.created_at).getTime()
    );
  });

  it('persists the update to the database', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    await updateReview(review.id, { rating: 2, body: 'Changed my mind.' });

    const fetched = await getReviewById(review.id);
    expect(fetched.rating).toBe(2);
    expect(fetched.body).toBe('Changed my mind.');
  });

  it('can set body to null', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id, 7, 'Had a body.');

    const updated = await updateReview(review.id, { body: null });

    expect(updated.body).toBeNull();
  });

  it('does not update anime_id or user_id even if passed', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);

    const updated = await updateReview(review.id, {
      rating: 6,
      anime_id: '00000000-0000-4000-8000-000000000000',
      user_id: '00000000-0000-4000-8000-000000000000',
    });

    expect(updated.anime_id).toBe(anime.id);
    expect(updated.user_id).toBe(user.id);
  });

  it('returns null for a valid UUID that does not exist', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const updated = await updateReview(nonExistentId, { rating: 5 });

    expect(updated).toBeNull();
  });

  it('returns null for an invalid UUID', async () => {
    const updated = await updateReview('not-a-uuid', { rating: 5 });

    expect(updated).toBeNull();
  });
});