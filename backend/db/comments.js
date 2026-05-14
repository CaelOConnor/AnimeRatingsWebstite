import { query } from './db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


/**
 * Create a comment on a review.
 * Throws a friendly error if the review or user does not exist.
 *
 * @param {{ reviewId: string, userId: string, body: string }} params
 * @returns {Promise<object>} The created comment row
 */
export async function createComment({ reviewId, userId, body }) {
  try {
    const result = await query(
      `INSERT INTO comments (review_id, user_id, body)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [reviewId, userId, body]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === '23503') {
      if (err.detail?.includes('review_id')) {
        throw new Error('Review not found.');
      }
      if (err.detail?.includes('user_id')) {
        throw new Error('User not found.');
      }
    }
    throw err;
  }
}


/**
 * Fetch all comments for a given review, with the commenter's username joined in.
 * Returns an empty array if the review has no comments or does not exist.
 *
 * @param {string} reviewId - Internal UUID of the review
 * @returns {Promise<object[]>} Array of comment rows, each including username
 */
export async function getCommentsByReviewId(reviewId) {
  const result = await query(
    `SELECT
       comments.id,
       comments.review_id,
       comments.user_id,
       comments.body,
       comments.created_at,
       comments.updated_at,
       users.username
     FROM comments
     JOIN users ON comments.user_id = users.id
     WHERE comments.review_id = $1
     ORDER BY comments.created_at ASC`,
    [reviewId]
  );
  return result.rows;
}


/**
 * Fetch a single comment by its internal UUID.
 * Returns null if the id is not a valid UUID or no matching row exists.
 *
 * @param {string} id - Internal UUID of the comment
 * @returns {Promise<object|null>} The comment row, or null on miss
 */
export async function getCommentById(id) {
  if (!UUID_REGEX.test(id)) return null;

  const result = await query(
    `SELECT
       id,
       review_id,
       user_id,
       body,
       created_at,
       updated_at
     FROM comments
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] ?? null;
}


/**
 * Partially update a comment's body.
 * Only `body` is updatable — all other fields are ignored.
 * `updated_at` is handled automatically by a Postgres trigger.
 * Returns null if the id is not a valid UUID or no matching row exists.
 *
 * @param {string} id - Internal UUID of the comment
 * @param {object} fields - Fields to update: { body? }
 * @returns {Promise<object|null>} The updated comment row, or null on miss
 */
export async function updateComment(id, fields) {
  if (!UUID_REGEX.test(id)) return null;

  if (!Object.hasOwn(fields, 'body')) return await getCommentById(id);

  const result = await query(
    `UPDATE comments
     SET body = $1
     WHERE id = $2
     RETURNING *`,
    [fields.body, id]
  );

  return result.rows[0] ?? null;
}


/**
 * Delete a comment by its internal UUID.
 * Returns the deleted row, or null if the id is invalid or no row was found.
 *
 * @param {string} id - Internal UUID of the comment
 * @returns {Promise<object|null>} The deleted comment row, or null on miss
 */
export async function deleteComment(id) {
  if (!UUID_REGEX.test(id)) return null;

  const result = await query(
    `DELETE FROM comments
     WHERE id = $1
     RETURNING *`,
    [id]
  );

  return result.rows[0] ?? null;
}


/**
 * Fetch all comments made by a given user, with the review body joined in for context.
 * Returns an empty array if the user has no comments or does not exist.
 *
 * @param {string} userId - Internal UUID of the user
 * @returns {Promise<object[]>} Array of comment rows, each including review_body
 */
export async function getCommentsByUserId(userId) {
  const result = await query(
    `SELECT
       comments.id,
       comments.review_id,
       comments.user_id,
       comments.body,
       comments.created_at,
       comments.updated_at,
       reviews.body AS review_body
     FROM comments
     JOIN reviews ON comments.review_id = reviews.id
     WHERE comments.user_id = $1
     ORDER BY comments.created_at DESC`,
    [userId]
  );
  return result.rows;
}