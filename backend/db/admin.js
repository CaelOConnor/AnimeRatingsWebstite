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

/**
 * getReports
 * ----------
 * Returns pending reports grouped by reported_user_id, newest first.
 * Each row represents one user who has been reported, with an aggregate
 * count and the most recent reason.
 */
export async function getReports(status = 'pending') {
  const result = await query(
    `SELECT
      u.id              AS reported_user_id,
      u.username        AS reported_username,
      u.is_banned,
      COUNT(r.id)::int  AS report_count,
      MAX(r.created_at) AS latest_report_at,
      (
        SELECT r2.reason
        FROM reports r2
        WHERE r2.reported_user_id = u.id
          AND r2.status = $1
          AND r2.reason IS NOT NULL
        ORDER BY r2.created_at DESC
        LIMIT 1
      ) AS latest_reason,
      (
        SELECT r3.id
        FROM reports r3
        WHERE r3.reported_user_id = u.id
          AND r3.status = $1
        ORDER BY r3.created_at DESC
        LIMIT 1
      ) AS latest_report_id
     FROM reports r
     JOIN users u ON u.id = r.reported_user_id
     WHERE r.status = $1
     GROUP BY u.id, u.username, u.is_banned
     ORDER BY MAX(r.created_at) DESC`,
    [status]
  );
  return result.rows;
}

/**
 * dismissAllReportsForUser
 * ------------------------
 * Sets all pending reports against a user to 'dismissed'.
 */
export async function dismissAllReportsForUser(reportedUserId, resolvedBy) {
  await query(
    `UPDATE reports
     SET status = 'dismissed', resolved_at = NOW(), resolved_by = $2
     WHERE reported_user_id = $1 AND status = 'pending'`,
    [reportedUserId, resolvedBy]
  );
}