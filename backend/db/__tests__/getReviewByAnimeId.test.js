import { describe, it, expect, afterEach } from 'vitest';
import { getReviewsByAnimeId } from '../reviews.js';
import { createReview } from '../reviews.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
const _prefix = 'rv_ani'; 

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

describe('getReviewsByAnimeId', () => {
  it('returns an empty array when no reviews exist for the anime', async () => {
    const anime = await makeAnime();

    const reviews = await getReviewsByAnimeId(anime.id);

    expect(reviews).toEqual([]);
  });

  it('returns a single review for an anime that has one', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 8,
      body: 'Great show.',
    });

    const reviews = await getReviewsByAnimeId(anime.id);

    expect(reviews).toHaveLength(1);
  });

  it('returns all reviews when multiple users have reviewed the same anime', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const userC = await makeUser('_c');
    const anime = await makeAnime();

    await createReview({ animeId: anime.id, userId: userA.id, rating: 9, body: 'Loved it.' });
    await createReview({ animeId: anime.id, userId: userB.id, rating: 6, body: 'It was okay.' });
    await createReview({ animeId: anime.id, userId: userC.id, rating: 3, body: 'Not for me.' });

    const reviews = await getReviewsByAnimeId(anime.id);

    expect(reviews).toHaveLength(3);
  });

  it('returns the correct fields on each review', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 7,
      body: 'Solid.',
    });

    const reviews = await getReviewsByAnimeId(anime.id);
    const review = reviews[0];

    expect(review).toMatchObject({
      anime_id: anime.id,
      user_id: user.id,
      rating: 7,
      body: 'Solid.',
    });
    expect(review.id).toBeDefined();
    expect(review.created_at).toBeDefined();
    expect(review.updated_at).toBeDefined();
  });

  it('joins and returns the username from the users table', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await createReview({
      animeId: anime.id,
      userId: user.id,
      rating: 8,
      body: 'Good.',
    });

    const reviews = await getReviewsByAnimeId(anime.id);

    expect(reviews[0].username).toBe(user.username);
  });

  it('does not return password_hash on any review', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await createReview({ animeId: anime.id, userId: user.id, rating: 5, body: 'Mid.' });

    const reviews = await getReviewsByAnimeId(anime.id);

    expect(reviews[0].password_hash).toBeUndefined();
  });

  it('only returns reviews for the requested anime, not others', async () => {
    const user = await makeUser();
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);

    await createReview({ animeId: animeA.id, userId: user.id, rating: 9, body: 'For anime A.' });
    await createReview({ animeId: animeB.id, userId: user.id, rating: 4, body: 'For anime B.' });

    const reviews = await getReviewsByAnimeId(animeA.id);

    expect(reviews).toHaveLength(1);
    expect(reviews[0].anime_id).toBe(animeA.id);
  });

  it('returns an empty array for a valid UUID that does not exist', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const reviews = await getReviewsByAnimeId(nonExistentId);

    expect(reviews).toEqual([]);
  });

  it('handles a review with a null body correctly', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await createReview({ animeId: anime.id, userId: user.id, rating: 7, body: null });

    const reviews = await getReviewsByAnimeId(anime.id);

    expect(reviews[0].body).toBeNull();
  });
});