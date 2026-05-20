import { describe, it, expect, afterEach } from 'vitest';
import { updateComment, createComment, getCommentById } from '../comments.js';
import { createReview } from '../reviews.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeUser(suffix = '') {
  return createUser({
    username: `com_update_user${suffix}`,
    email: `com_update_user${suffix}@example.com`,
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

async function makeComment(reviewId, userId, body = 'Original body.') {
  return createComment({ reviewId, userId, body });
}

async function makeReview(animeId, userId) {
  return createReview({ animeId, userId, rating: 7, body: 'A review.' });
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(async () => {
  await query(`DELETE FROM users WHERE email LIKE 'com_update_user%@example.com'`);
  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('updateComment', () => {
  it('updates the body and returns the updated comment', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);
    const comment = await makeComment(review.id, user.id);

    const updated = await updateComment(comment.id, { body: 'Updated body.' });

    expect(updated.body).toBe('Updated body.');
  });

  it('returns the full comment row after update', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);
    const comment = await makeComment(review.id, user.id);

    const updated = await updateComment(comment.id, { body: 'Updated.' });

    expect(updated.id).toBe(comment.id);
    expect(updated.review_id).toBe(review.id);
    expect(updated.user_id).toBe(user.id);
    expect(updated.created_at).toBeDefined();
    expect(updated.updated_at).toBeDefined();
  });

  it('updated_at is more recent than created_at after update', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);
    const comment = await makeComment(review.id, user.id);

    await new Promise((res) => setTimeout(res, 50));

    const updated = await updateComment(comment.id, { body: 'Changed.' });

    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
      new Date(updated.created_at).getTime()
    );
  });

  it('persists the update to the database', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);
    const comment = await makeComment(review.id, user.id);

    await updateComment(comment.id, { body: 'Persisted change.' });

    const fetched = await getCommentById(comment.id);
    expect(fetched.body).toBe('Persisted change.');
  });

  it('does not update review_id or user_id even if passed', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);
    const comment = await makeComment(review.id, user.id);

    const updated = await updateComment(comment.id, {
      body: 'Updated.',
      review_id: '00000000-0000-4000-8000-000000000000',
      user_id: '00000000-0000-4000-8000-000000000000',
    });

    expect(updated.review_id).toBe(review.id);
    expect(updated.user_id).toBe(user.id);
  });

  it('returns null for a valid UUID that does not exist', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const updated = await updateComment(nonExistentId, { body: 'Ghost update.' });

    expect(updated).toBeNull();
  });

  it('returns null for an invalid UUID', async () => {
    const updated = await updateComment('not-a-uuid', { body: 'Bad id.' });

    expect(updated).toBeNull();
  });
});