import { query } from './db.js';

/**
 * createReport
 * ------------
 * Files a report against a user for a specific piece of content.
 */
export async function createReport(reporterId, targetType, targetId, reportedUserId) {
  const result = await query(
    `INSERT INTO reports (reporter_id, target_type, target_id, reported_user_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [reporterId, targetType, targetId, reportedUserId]
  );
  return result.rows[0];
}