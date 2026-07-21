import { query } from './db.js';

/**
 * Create a feedback row (show request or bug report).
 * Throws a friendly error if the user does not exist.
 *
 * @param {{ userId: string, type: 'show_request'|'bug_report', content: string }} params
 * @returns {Promise<object>} The created feedback row
 */
export async function createFeedback({ userId, type, content }) {
  try {
    const result = await query(
      `INSERT INTO feedback (user_id, type, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, type, content]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === '23503' && err.detail?.includes('user_id')) {
      throw new Error('User not found.');
    }
    throw err;
  }
}

/**
 * Mark a feedback row as resolved (soft — keeps the row, just filters it out
 * of getAllFeedback() going forward, so the history isn't lost).
 *
 * @param {string} id - Internal UUID of the feedback row
 * @returns {Promise<object|null>} The updated row, or null if no match
 */
export async function resolveFeedback(id) {
  const result = await query(
    `UPDATE feedback
     SET resolved = TRUE
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return result.rows[0] ?? null;
}
