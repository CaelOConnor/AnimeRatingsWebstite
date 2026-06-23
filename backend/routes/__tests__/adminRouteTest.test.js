import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import supertest from 'supertest';
import app from '../../app.js';
import { createTestUser } from './testHelpers.js';
import { createReview } from '../../db/reviews.js';
import { createComment } from '../../db/comments.js';
import { upsertAnime } from '../../db/anime.js';
import { query } from '../../db/db.js';

const request = supertest(app);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TMDB_ID_BASE = 88500; // dedicated range — no overlap with other test files
let _seq = 0;

async function makeAnime() {
  const tmdbId = TMDB_ID_BASE + ++_seq;
  return upsertAnime({
    tmdbId,
    tmdbType: 'tv',
    seasonNumber: null,
    title: `Admin Test Anime ${tmdbId}`,
    originalTitle: null,
    overview: 'A test anime.',
    posterPath: null,
    backdropPath: null,
    episodeCount: null,
    seasonCount: null,
    status: 'Ended',
    firstAirDate: '2021-01-01',
    genres: [],
  });
}

async function makeReview(userId, animeId) {
  return createReview({ userId, animeId, rating: 7, body: 'Test review.' });
}

async function makeComment(userId, reviewId) {
  return createComment({ userId, reviewId, body: 'Test comment.' });
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let adminUser, adminToken;
let modUser, modToken;
let regularUser, regularToken;
let anime;

beforeAll(async () => {
  [
    { user: adminUser, token: adminToken },
    { user: modUser, token: modToken },
    { user: regularUser, token: regularToken },
  ] = await Promise.all([
    createTestUser({ role_type: 'admin' }),
    createTestUser({ role_type: 'moderator' }),
    createTestUser(),
  ]);

  anime = await makeAnime();
});

afterAll(async () => {
  await query(
    `DELETE FROM users WHERE id IN ($1, $2, $3)`,
    [adminUser.id, modUser.id, regularUser.id],
  );
  await query(
    `DELETE FROM anime WHERE tmdb_id >= $1 AND tmdb_id < $2`,
    [TMDB_ID_BASE, TMDB_ID_BASE + 200],
  );
});

// ---------------------------------------------------------------------------
// GET /api/admin/users
// ---------------------------------------------------------------------------

describe('GET /api/admin/users', () => {
  it('returns 200 and an array of users for an admin', async () => {
    const res = await request
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 200 and an array of users for a moderator', async () => {
    const res = await request
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns the correct fields on each user', async () => {
    const res = await request
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const user = res.body[0];
    expect(user.id).toBeDefined();
    expect(user.username).toBeDefined();
    expect(user.email).toBeDefined();
    expect(user.role_type).toBeDefined();
    expect(user.created_at).toBeDefined();
    // password_hash must never be exposed
    expect(user.password_hash).toBeUndefined();
  });

  it('returns 403 for a regular user', async () => {
    const res = await request
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request.get('/api/admin/users');

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/users/banned
// ---------------------------------------------------------------------------

describe('GET /api/admin/users/banned', () => {
  let bannedUser;

  beforeAll(async () => {
    ({ user: bannedUser } = await createTestUser());
    await query(`UPDATE users SET is_banned = true WHERE id = $1`, [bannedUser.id]);
  });

  afterAll(async () => {
    await query(`DELETE FROM users WHERE id = $1`, [bannedUser.id]);
  });

  it('returns 200 and only banned users for an admin', async () => {
    const res = await request
      .get('/api/admin/users/banned')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const ids = res.body.map((u) => u.id);
    expect(ids).toContain(bannedUser.id);
  });

  it('only returns users where is_banned is true', async () => {
    const res = await request
      .get('/api/admin/users/banned')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.every((u) => u.is_banned === true)).toBe(true);
  });

  it('returns 200 and the list for a moderator', async () => {
    const res = await request
      .get('/api/admin/users/banned')
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(200);
  });

  it('returns 403 for a regular user', async () => {
    const res = await request
      .get('/api/admin/users/banned')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request.get('/api/admin/users/banned');

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/ban
// ---------------------------------------------------------------------------

describe('POST /api/admin/users/:id/ban', () => {
  let targetUser;

  // Fresh target for each test so ban state doesn't bleed between cases
  beforeAll(async () => {
    ({ user: targetUser } = await createTestUser());
  });

  afterAll(async () => {
    await query(`DELETE FROM users WHERE id = $1`, [targetUser.id]);
  });

  it('returns 200 and sets is_banned to true for an admin', async () => {
    const res = await request
      .post(`/api/admin/users/${targetUser.id}/ban`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.is_banned).toBe(true);
  });

  it('invalidates the banned user\'s active tokens in Redis', async () => {
    // After banning, the user's token should be rejected on subsequent requests
    const { user: freshUser, token: freshToken } = await createTestUser();

    await request
      .post(`/api/admin/users/${freshUser.id}/ban`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Any authenticated request with the old token should now return 401
    const res = await request
      .get('/api/watchlist')
      .set('Authorization', `Bearer ${freshToken}`);

    expect(res.status).toBe(401);

    await query(`DELETE FROM users WHERE id = $1`, [freshUser.id]);
  });

  it('returns 200 when banning an already-banned user (idempotent)', async () => {
    const res = await request
      .post(`/api/admin/users/${targetUser.id}/ban`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.is_banned).toBe(true);
  });

  it('returns 403 for a moderator', async () => {
    const res = await request
      .post(`/api/admin/users/${targetUser.id}/ban`)
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 403 for a regular user', async () => {
    const res = await request
      .post(`/api/admin/users/${targetUser.id}/ban`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent user id', async () => {
    const res = await request
      .post('/api/admin/users/00000000-0000-4000-8000-000000000000/ban')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const res = await request
      .post('/api/admin/users/not-a-uuid/ban')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request.post(`/api/admin/users/${targetUser.id}/ban`);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/unban
// ---------------------------------------------------------------------------

describe('POST /api/admin/users/:id/unban', () => {
  let targetUser;

  beforeAll(async () => {
    ({ user: targetUser } = await createTestUser());
    await query(`UPDATE users SET is_banned = true WHERE id = $1`, [targetUser.id]);
  });

  afterAll(async () => {
    await query(`DELETE FROM users WHERE id = $1`, [targetUser.id]);
  });

  it('returns 200 and sets is_banned to false for an admin', async () => {
    const res = await request
      .post(`/api/admin/users/${targetUser.id}/unban`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.is_banned).toBe(false);
  });

  it('returns 200 when unbanning an already-unbanned user (idempotent)', async () => {
    const res = await request
      .post(`/api/admin/users/${targetUser.id}/unban`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.is_banned).toBe(false);
  });

  it('returns 403 for a moderator', async () => {
    const res = await request
      .post(`/api/admin/users/${targetUser.id}/unban`)
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 403 for a regular user', async () => {
    const res = await request
      .post(`/api/admin/users/${targetUser.id}/unban`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent user id', async () => {
    const res = await request
      .post('/api/admin/users/00000000-0000-4000-8000-000000000000/unban')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const res = await request
      .post('/api/admin/users/not-a-uuid/unban')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request.post(`/api/admin/users/${targetUser.id}/unban`);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/users/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/admin/users/:id', () => {
  it('returns 204 and deletes the user for an admin', async () => {
    const { user: deleteTarget } = await createTestUser();

    const res = await request
      .delete(`/api/admin/users/${deleteTarget.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);

    // Confirm gone
    const check = await request
      .get(`/api/users/${deleteTarget.id}`)
    expect(check.status).toBe(404);
  });

  it('invalidates the deleted user\'s active tokens in Redis', async () => {
    const { user: freshUser, token: freshToken } = await createTestUser();

    await request
      .delete(`/api/admin/users/${freshUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Any authenticated request with the old token should now return 401
    const res = await request
      .get('/api/watchlist')
      .set('Authorization', `Bearer ${freshToken}`);

    expect(res.status).toBe(401);
  });

  it('returns 403 for a moderator', async () => {
    const { user: deleteTarget } = await createTestUser();

    const res = await request
      .delete(`/api/admin/users/${deleteTarget.id}`)
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(403);

    await query(`DELETE FROM users WHERE id = $1`, [deleteTarget.id]);
  });

  it('returns 403 for a regular user', async () => {
    const res = await request
      .delete(`/api/admin/users/${regularUser.id}`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent user id', async () => {
    const res = await request
      .delete('/api/admin/users/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const res = await request
      .delete('/api/admin/users/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request.delete(`/api/admin/users/${regularUser.id}`);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/reviews
// ---------------------------------------------------------------------------

describe('GET /api/admin/reviews', () => {
  let review;

  beforeAll(async () => {
    review = await makeReview(regularUser.id, anime.id);
  });

  it('returns 200 and an array of recent reviews for an admin', async () => {
    const res = await request
      .get('/api/admin/reviews')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 200 and recent reviews for a moderator', async () => {
    const res = await request
      .get('/api/admin/reviews')
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns the correct fields on each review', async () => {
    const res = await request
      .get('/api/admin/reviews')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const r = res.body[0];
    expect(r.id).toBeDefined();
    expect(r.user_id).toBeDefined();
    expect(r.anime_id).toBeDefined();
    expect(r.created_at).toBeDefined();
  });

  it('returns 403 for a regular user', async () => {
    const res = await request
      .get('/api/admin/reviews')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request.get('/api/admin/reviews');

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/reviews/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/admin/reviews/:id', () => {
  let review;
  let reviewUser;

  beforeEach(async () => {
    const { user } = await createTestUser();
    reviewUser = user;
    review = await makeReview(reviewUser.id, anime.id);
  });

  afterEach(async () => {
    if (review?.id) {
      await query(`DELETE FROM reviews WHERE id = $1`, [review.id]).catch(() => {});
    }
    if (reviewUser?.id) {
      await query(`DELETE FROM users WHERE id = $1`, [reviewUser.id]).catch(() => {});
    }
  });

  it('returns 204 and deletes any review for an admin', async () => {
    const res = await request
      .delete(`/api/admin/reviews/${review.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it('returns 403 for a moderator', async () => {
    const res = await request
      .delete(`/api/admin/reviews/${review.id}`)
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 403 for a regular user', async () => {
    const res = await request
      .delete(`/api/admin/reviews/${review.id}`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent review id', async () => {
    const res = await request
      .delete('/api/admin/reviews/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const res = await request
      .delete('/api/admin/reviews/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request.delete(`/api/admin/reviews/${review.id}`);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/comments/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/admin/comments/:id', () => {
  let review;
  let comment;
  let reviewUser;

  beforeEach(async () => {
    const { user } = await createTestUser();
    reviewUser = user;
    review = await makeReview(reviewUser.id, anime.id);
    comment = await makeComment(reviewUser.id, review.id);
  });

  afterEach(async () => {
    if (comment?.id) {
      await query(`DELETE FROM comments WHERE id = $1`, [comment.id]).catch(() => {});
    }
    if (review?.id) {
      await query(`DELETE FROM reviews WHERE id = $1`, [review.id]).catch(() => {});
    }
    if (reviewUser?.id) {
      await query(`DELETE FROM users WHERE id = $1`, [reviewUser.id]).catch(() => {});
    }
  });

  it('returns 204 and deletes any comment for an admin', async () => {
    const res = await request
      .delete(`/api/admin/comments/${comment.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it('returns 403 for a moderator', async () => {
    const res = await request
      .delete(`/api/admin/comments/${comment.id}`)
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 403 for a regular user', async () => {
    const res = await request
      .delete(`/api/admin/comments/${comment.id}`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent comment id', async () => {
    const res = await request
      .delete('/api/admin/comments/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const res = await request
      .delete('/api/admin/comments/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request.delete(`/api/admin/comments/${comment.id}`);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/reports
// ---------------------------------------------------------------------------

describe('GET /api/admin/reports', () => {
  let reportedUser;
  let review;

  beforeEach(async () => {
    ({ user: reportedUser } = await createTestUser());
    review = await makeReview(reportedUser.id, anime.id);
    await query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reported_user_id, reason)
       VALUES ($1, 'review', $2, $3, 'Spam')`,
      [regularUser.id, review.id, reportedUser.id]
    );
  });

  afterEach(async () => {
    await query(`DELETE FROM reports WHERE reported_user_id = $1`, [reportedUser.id]);
    await query(`DELETE FROM reviews WHERE id = $1`, [review.id]).catch(() => {});
    await query(`DELETE FROM users WHERE id = $1`, [reportedUser.id]).catch(() => {});
  });

  it('returns 200 and an array for an admin', async () => {
    const res = await request
      .get('/api/admin/reports')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 200 and an array for a moderator', async () => {
    const res = await request
      .get('/api/admin/reports')
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns the correct fields on each row', async () => {
    const res = await request
      .get('/api/admin/reports')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const row = res.body.find(r => r.reported_user_id === reportedUser.id);
    expect(row).toBeDefined();
    expect(row.reported_username).toBeDefined();
    expect(row.report_count).toBeGreaterThanOrEqual(1);
    expect(row.latest_report_at).toBeDefined();
  });

  it('aggregates multiple reports against the same user into one row', async () => {
    await query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reported_user_id, reason)
       VALUES ($1, 'review', $2, $3, 'Harassment')`,
      [adminUser.id, review.id, reportedUser.id]
    );

    const res = await request
      .get('/api/admin/reports')
      .set('Authorization', `Bearer ${adminToken}`);

    const rows = res.body.filter(r => r.reported_user_id === reportedUser.id);
    expect(rows.length).toBe(1);
    expect(rows[0].report_count).toBe(2);
  });

  it('returns 403 for a regular user', async () => {
    const res = await request
      .get('/api/admin/reports')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request.get('/api/admin/reports');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/reports/dismiss/:userId
// ---------------------------------------------------------------------------

describe('POST /api/admin/reports/dismiss/:userId', () => {
  let reportedUser;
  let review;

  beforeEach(async () => {
    ({ user: reportedUser } = await createTestUser());
    review = await makeReview(reportedUser.id, anime.id);
    await query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reported_user_id, reason)
       VALUES ($1, 'review', $2, $3, 'Spam')`,
      [regularUser.id, review.id, reportedUser.id]
    );
  });

  afterEach(async () => {
    await query(`DELETE FROM reports WHERE reported_user_id = $1`, [reportedUser.id]);
    await query(`DELETE FROM reviews WHERE id = $1`, [review.id]).catch(() => {});
    await query(`DELETE FROM users WHERE id = $1`, [reportedUser.id]).catch(() => {});
  });

  it('returns 204 and dismisses all pending reports for an admin', async () => {
    const res = await request
      .post(`/api/admin/reports/dismiss/${reportedUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);

    const check = await query(
      `SELECT * FROM reports WHERE reported_user_id = $1 AND status = 'pending'`,
      [reportedUser.id]
    );
    expect(check.rows.length).toBe(0);
  });

  it('returns 204 and dismisses all pending reports for a moderator', async () => {
    const res = await request
      .post(`/api/admin/reports/dismiss/${reportedUser.id}`)
      .set('Authorization', `Bearer ${modToken}`);

    expect(res.status).toBe(204);
  });

  it('sets resolved_by to the acting moderator', async () => {
    await request
      .post(`/api/admin/reports/dismiss/${reportedUser.id}`)
      .set('Authorization', `Bearer ${modToken}`);

    const check = await query(
      `SELECT resolved_by FROM reports WHERE reported_user_id = $1`,
      [reportedUser.id]
    );
    expect(check.rows[0].resolved_by).toBe(modUser.id);
  });

  it('is idempotent — dismissing twice returns 204 both times', async () => {
    await request
      .post(`/api/admin/reports/dismiss/${reportedUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const res = await request
      .post(`/api/admin/reports/dismiss/${reportedUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it('returns 404 for a non-existent user', async () => {
    const res = await request
      .post('/api/admin/reports/dismiss/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const res = await request
      .post('/api/admin/reports/dismiss/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('returns 403 for a regular user', async () => {
    const res = await request
      .post(`/api/admin/reports/dismiss/${reportedUser.id}`)
      .set('Authorization', `Bearer ${regularToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request
      .post(`/api/admin/reports/dismiss/${reportedUser.id}`);

    expect(res.status).toBe(401);
  });
});