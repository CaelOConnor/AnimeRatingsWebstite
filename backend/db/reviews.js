import { query } from './db.js';

/**
 * Create a review for an anime by a user.
 * Throws a friendly error if the user has already reviewed this anime.
 *
 * @param {{ animeId: string, userId: string, rating: number, body: string|null }} params
 * @returns {Promise<object>} The created review row
 */
export async function createReview({ animeId, userId, rating, body }) {
  try {
    const result = await query(
      `INSERT INTO reviews (anime_id, user_id, rating, body)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [animeId, userId, rating, body ?? null]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw new Error('You have already reviewed this anime.');
    }
    throw err;
  }
}


/**
 * Fetch all reviews for a given anime, with the reviewer's username joined in.
 * Returns an empty array if the anime has no reviews or does not exist.
 *
 * @param {string} animeId - Internal UUID of the anime
 * @returns {Promise<object[]>} Array of review rows, each including username
 */
export async function getReviewsByAnimeId(animeId) {
  const result = await query(
    `SELECT
       reviews.id,
       reviews.anime_id,
       reviews.user_id,
       reviews.rating,
       reviews.body,
       reviews.created_at,
       reviews.updated_at,
       users.username
     FROM reviews
     JOIN users ON reviews.user_id = users.id
     WHERE reviews.anime_id = $1
     ORDER BY reviews.created_at DESC`,
    [animeId]
  );
  return result.rows;
}

 
/**
 * Fetch all reviews written by a given user, with the anime title joined in.
 * Returns an empty array if the user has no reviews or does not exist.
 *
 * @param {string} userId - Internal UUID of the user
 * @returns {Promise<object[]>} Array of review rows, each including anime title
 */
export async function getReviewsByUserId(userId) {
  const result = await query(
    `SELECT
       reviews.id,
       reviews.anime_id,
       reviews.user_id,
       reviews.rating,
       reviews.body,
       reviews.created_at,
       reviews.updated_at,
       anime.title
     FROM reviews
     JOIN anime ON reviews.anime_id = anime.id
     WHERE reviews.user_id = $1
     ORDER BY reviews.created_at DESC`,
    [userId]
  );
  return result.rows;
}



/**
 * Fetch a single review by its internal UUID.
 * Returns null if the id is not a valid UUID or no matching row exists.
 *
 * @param {string} id - Internal UUID of the review
 * @returns {Promise<object|null>} The review row, or null on miss
 */
export async function getReviewById(id) {
  if (!UUID_REGEX.test(id)) return null;
 
  const result = await query(
    `SELECT
       id,
       anime_id,
       user_id,
       rating,
       body,
       created_at,
       updated_at
     FROM reviews
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Partially update a review's rating and/or body.
 * Only `rating` and `body` are updatable — all other fields are ignored.
 * `updated_at` is handled automatically by a Postgres trigger.
 * Returns null if the id is not a valid UUID or no matching row exists.
 *
 * @param {string} id - Internal UUID of the review
 * @param {object} fields - Fields to update: { rating?, body? }
 * @returns {Promise<object|null>} The updated review row, or null on miss
 */
export async function updateReview(id, fields) {
  if (!UUID_REGEX.test(id)) return null;
 
  const ALLOWED = ['rating', 'body'];
 
  const updates = [];
  const values = [];
 
  for (const key of ALLOWED) {
    if (Object.hasOwn(fields, key)) {
      values.push(fields[key] ?? null);
      updates.push(`${key} = $${values.length}`);
    }
  }
 
  if (updates.length === 0) return await getReviewById(id);
 
  values.push(id);
 
  const result = await query(
    `UPDATE reviews
     SET ${updates.join(', ')}
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );
 
  return result.rows[0] ?? null;
}


/**
 * Delete a review by its internal UUID.
 * Returns the deleted row, or null if the id is invalid or no row was found.
 *
 * @param {string} id - Internal UUID of the review
 * @returns {Promise<object|null>} The deleted review row, or null on miss
 */
export async function deleteReview(id) {
  if (!UUID_REGEX.test(id)) return null;
 
  const result = await query(
    `DELETE FROM reviews
     WHERE id = $1
     RETURNING *`,
    [id]
  );
 
  return result.rows[0] ?? null;
}