import { query } from './db.js';

/**
 * getUsersByRole
 * --------------
 * Returns all users ordered by created_at DESC.
 * Used by the admin/mod user management view.
 */
export async function getUsersByRole() {
  const result = await query(
    `SELECT id, username, email, role_type, is_banned, created_at
     FROM users
     ORDER BY created_at DESC`
  );
  return result.rows;
}

/**
 * getBannedUsers
 * --------------
 * Returns only users where is_banned = true.
 */
export async function getBannedUsers() {
  const result = await query(
    `SELECT id, username, email, role_type, is_banned, created_at
     FROM users
     WHERE is_banned = true
     ORDER BY created_at DESC`
  );
  return result.rows;
}

/**
 * getRecentReviews
 * ----------------
 * Returns recent reviews for the moderation queue, newest first.
 * Joins username and anime title for context.
 */
export async function getRecentReviews(limit = 50) {
  const result = await query(
    `SELECT
      r.id,
      r.user_id,
      r.anime_id,
      r.rating,
      r.body,
      r.created_at,
      u.username,
      a.title AS anime_title
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     JOIN anime a ON a.id = r.anime_id
     ORDER BY r.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}