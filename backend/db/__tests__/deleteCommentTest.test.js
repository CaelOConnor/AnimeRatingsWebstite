import { describe, it, expect, afterEach } from 'vitest';
import { deleteComment, createComment, getCommentById } from '../comments.js';
import { createReview } from '../reviews.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
const _prefix = 'cm_del';

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

async function makeReview(animeId, userId) {
  return createReview({ animeId, userId, rating: 7, body: 'A review.' });
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

describe('deleteComment', () => {
  it('deletes the comment so it can no longer be fetched', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);
    const comment = await createComment({ reviewId: review.id, userId: user.id, body: 'To be deleted.' });

    await deleteComment(comment.id);

    const fetched = await getCommentById(comment.id);
    expect(fetched).toBeNull();
  });

  it('returns the deleted comment row', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);
    const comment = await createComment({ reviewId: review.id, userId: user.id, body: 'Goodbye.' });

    const deleted = await deleteComment(comment.id);

    expect(deleted).toMatchObject({
      id: comment.id,
      review_id: review.id,
      user_id: user.id,
      body: 'Goodbye.',
    });
  });

  it('only deletes the targeted comment, not others on the same review', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);
    const commentA = await createComment({ reviewId: review.id, userId: user.id, body: 'Comment A.' });
    const commentB = await createComment({ reviewId: review.id, userId: user.id, body: 'Comment B.' });

    await deleteComment(commentA.id);

    const fetched = await getCommentById(commentB.id);
    expect(fetched).not.toBeNull();
    expect(fetched.id).toBe(commentB.id);
  });

  it('only deletes the targeted comment, not comments on other reviews', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);
    const reviewA = await makeReview(animeA.id, userA.id);
    const reviewB = await makeReview(animeB.id, userB.id);
    const commentA = await createComment({ reviewId: reviewA.id, userId: userA.id, body: 'On review A.' });
    const commentB = await createComment({ reviewId: reviewB.id, userId: userB.id, body: 'On review B.' });

    await deleteComment(commentA.id);

    const fetched = await getCommentById(commentB.id);
    expect(fetched).not.toBeNull();
    expect(fetched.id).toBe(commentB.id);
  });

  it('returns null for a valid UUID that does not exist', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const deleted = await deleteComment(nonExistentId);

    expect(deleted).toBeNull();
  });

  it('returns null for an invalid UUID', async () => {
    const deleted = await deleteComment('not-a-uuid');

    expect(deleted).toBeNull();
  });

  it('calling deleteComment twice on the same id returns null the second time', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const review = await makeReview(anime.id, user.id);
    const comment = await createComment({ reviewId: review.id, userId: user.id, body: 'Once.' });

    await deleteComment(comment.id);
    const second = await deleteComment(comment.id);

    expect(second).toBeNull();
  });
});