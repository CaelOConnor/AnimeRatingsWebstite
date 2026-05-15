import { describe, it, expect, afterEach } from 'vitest';
import supertest from 'supertest';
import app from '../../app.js';
import { createTestUser } from '../testHelpers.js';
import { createReview } from '../../db/reviews.js';
import { upsertAnime } from '../../db/anime.js';
import { query } from '../../db/db.js';

const request = supertest(app);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  await query(`DELETE FROM users WHERE email LIKE 'testuser_%@example.com'`);
});

// ---------------------------------------------------------------------------
// GET /api/reviews?animeId=
// ---------------------------------------------------------------------------

describe('GET /api/reviews?animeId=', () => {
  it('returns 200 and an empty array when the anime has no reviews', async () => {
    const anime = await makeAnime();

    const res = await request.get(`/api/reviews?animeId=${anime.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 and all reviews for the given anime', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    const anime = await makeAnime();

    await createReview({ animeId: anime.id, userId: userA.id, rating: 8, body: 'Great.' });
    await createReview({ animeId: anime.id, userId: userB.id, rating: 6, body: 'Decent.' });

    const res = await request.get(`/api/reviews?animeId=${anime.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('returns the correct fields on each review including username', async () => {
    const { user } = await createTestUser();
    const anime = await makeAnime();

    await createReview({ animeId: anime.id, userId: user.id, rating: 9, body: 'Loved it.' });

    const res = await request.get(`/api/reviews?animeId=${anime.id}`);
    const review = res.body[0];

    expect(review).toMatchObject({
      anime_id: anime.id,
      user_id: user.id,
      rating: 9,
      body: 'Loved it.',
      username: user.username,
    });
    expect(review.id).toBeDefined();
    expect(review.created_at).toBeDefined();
    expect(review.updated_at).toBeDefined();
  });

  it('does not return password_hash on any review', async () => {
    const { user } = await createTestUser();
    const anime = await makeAnime();

    await createReview({ animeId: anime.id, userId: user.id, rating: 7, body: 'Good.' });

    const res = await request.get(`/api/reviews?animeId=${anime.id}`);

    expect(res.body[0].password_hash).toBeUndefined();
  });

  it('returns 200 and an empty array for a valid UUID with no matching anime', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const res = await request.get(`/api/reviews?animeId=${nonExistentId}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 400 when animeId is missing', async () => {
    const res = await request.get('/api/reviews');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when animeId is not a valid UUID', async () => {
    const res = await request.get('/api/reviews?animeId=not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('is publicly accessible without a token', async () => {
    const anime = await makeAnime();

    const res = await request.get(`/api/reviews?animeId=${anime.id}`);

    expect(res.status).toBe(200);
  });

  it('only returns reviews for the requested anime, not others', async () => {
    const { user } = await createTestUser();
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);

    await createReview({ animeId: animeA.id, userId: user.id, rating: 9, body: 'Anime A.' });

    const res = await request.get(`/api/reviews?animeId=${animeB.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});