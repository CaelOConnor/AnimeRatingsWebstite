import { describe, it, expect, afterEach } from 'vitest';
import { createUser, deleteUserById, getUserById } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const BASE_USER = {
  username: 'delete_tester',
  email: 'delete_tester@example.com',
  passwordHash: '$2b$10$fakehashfortest',
};

afterEach(async () => {
  // Safety net — if a test fails before the delete happens this prevents
  // the row from bleeding into the next test
  await query(`DELETE FROM users WHERE email = $1`, [BASE_USER.email]);
});

async function createBaseUser() {
  return createUser(BASE_USER);
}

// ---------------------------------------------------------------------------
// Helper — inserts a minimal anime row so foreign keys resolve
// ---------------------------------------------------------------------------

async function createTestAnime() {
  const result = await query(
    `INSERT INTO anime (tmdb_id, title, genres)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [99999, 'Test Anime', '{}']
  );
  return result.rows[0];
}

// Also add this to your afterEach so it gets cleaned up
afterEach(async () => {
  await query(`DELETE FROM users WHERE email = $1`, [BASE_USER.email]);
  await query(`DELETE FROM anime WHERE tmdb_id = $1`, [99999]); // cascades to reviews/watchlist
});

// ---------------------------------------------------------------------------
// deleteUserById
// ---------------------------------------------------------------------------

describe('deleteUserById', () => {

  it('removes the user row from the database', async () => {
    const user = await createBaseUser();

    await deleteUserById(user.id);

    // Try to fetch them — should be gone
    const found = await getUserById(user.id);
    expect(found == null).toBe(true);
  });

  it('returns the deleted user row', async () => {
    const user = await createBaseUser();

    const result = await deleteUserById(user.id);

    // Returning the deleted row is useful so the route layer can log it
    // or confirm to the admin exactly who was deleted
    expect(result).toBeDefined();
    expect(result.id).toBe(user.id);
    expect(result.username).toBe(BASE_USER.username);
  });

  it('does not return password_hash', async () => {
    const user = await createBaseUser();

    const result = await deleteUserById(user.id);

    expect(result.password_hash).toBeUndefined();
  });

  it('returns all expected safe fields on the deleted row', async () => {
    const user = await createBaseUser();

    const result = await deleteUserById(user.id);

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('username');
    expect(result).toHaveProperty('email');
    expect(result).toHaveProperty('avatar_url');
    expect(result).toHaveProperty('bio');
    expect(result).toHaveProperty('is_banned');
    expect(result).toHaveProperty('role_type');
    expect(result).toHaveProperty('created_at');
  });

  it('throws when the user id does not exist', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    await expect(deleteUserById(fakeId)).rejects.toThrow('User not found');
  });

  it('throws when no id is passed in', async () => {
    await expect(deleteUserById()).rejects.toThrow('id is required');
  });

  it('returns a single object, not an array', async () => {
    const user = await createBaseUser();

    const result = await deleteUserById(user.id);

    expect(Array.isArray(result)).toBe(false);
    expect(typeof result).toBe('object');
  });

  it('cascades — also deletes the users reviews', async () => {
    const user = await createBaseUser();
    const anime = await createTestAnime();

    await query(
        `INSERT INTO reviews (user_id, anime_id, body, rating)
        VALUES ($1, $2, $3, $4)`,
        [user.id, anime.id, 'Great anime', 9]
    );

    await deleteUserById(user.id);

    const reviews = await query(
        `SELECT * FROM reviews WHERE user_id = $1`,
        [user.id]
    );
    expect(reviews.rows.length).toBe(0);
    });

    it('cascades — also deletes the users comments', async () => {
    const user = await createBaseUser();
    const anime = await createTestAnime();

    const review = await query(
        `INSERT INTO reviews (user_id, anime_id, body, rating)
        VALUES ($1, $2, $3, $4)
        RETURNING id`,
        [user.id, anime.id, 'Great anime', 9]
    );

    await query(
        `INSERT INTO comments (user_id, review_id, body)
        VALUES ($1, $2, $3)`,
        [user.id, review.rows[0].id, 'Great comment']
    );

    await deleteUserById(user.id);

    const comments = await query(
        `SELECT * FROM comments WHERE user_id = $1`,
        [user.id]
    );
    expect(comments.rows.length).toBe(0);
    });

    it('cascades — also deletes the users watchlist entries', async () => {
    const user = await createBaseUser();
    const anime = await createTestAnime();

    await query(
        `INSERT INTO watchlist (user_id, anime_id, status)
        VALUES ($1, $2, $3)`,
        [user.id, anime.id, 'watching']
    );

    await deleteUserById(user.id);

    const watchlist = await query(
        `SELECT * FROM watchlist WHERE user_id = $1`,
        [user.id]
    );
    expect(watchlist.rows.length).toBe(0);
    });

});