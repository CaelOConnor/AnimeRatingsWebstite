import { query } from './db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


/**
 * Add an anime to a user's watchlist.
 * Throws a friendly error if the entry already exists, or if the user/anime does not exist.
 *
 * @param {{ userId: string, animeId: string, status: string }} params
 * @returns {Promise<object>} The created watchlist entry row
 */
export async function addToWatchlist({ userId, animeId, status }) {
  try {
    const result = await query(
      `INSERT INTO watchlist (user_id, anime_id, status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, animeId, status]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw new Error('This anime is already in your watchlist.');
    }
    if (err.code === '23503') {
      if (err.detail?.includes('user_id')) {
        throw new Error('User not found.');
      }
      if (err.detail?.includes('anime_id')) {
        throw new Error('Anime not found.');
      }
    }
    throw err;
  }
}


/**
 * Fetch all watchlist entries for a given user, with anime title and poster joined in.
 * Returns an empty array if the user has no entries or does not exist.
 *
 * @param {string} userId - Internal UUID of the user
 * @returns {Promise<object[]>} Array of watchlist entries, each including title and poster_path
 */
export async function getWatchlistByUserId(userId) {
  const result = await query(
    `SELECT
       watchlist.id,
       watchlist.user_id,
       watchlist.anime_id,
       watchlist.status,
       watchlist.episodes_watched,
       watchlist.updated_at,
       anime.title,
       anime.poster_path
     FROM watchlist
     JOIN anime ON watchlist.anime_id = anime.id
     WHERE watchlist.user_id = $1
     ORDER BY watchlist.updated_at DESC`,
    [userId]
  );
  return result.rows;
}


/**
 * Fetch a single watchlist entry by the (user_id, anime_id) pair.
 * Returns null if either id is invalid, or no matching row exists.
 *
 * @param {string} userId - Internal UUID of the user
 * @param {string} animeId - Internal UUID of the anime
 * @returns {Promise<object|null>} The watchlist entry row, or null on miss
 */
export async function getWatchlistEntry(userId, animeId) {
  if (!UUID_REGEX.test(userId) || !UUID_REGEX.test(animeId)) return null;

  const result = await query(
    `SELECT
       id,
       user_id,
       anime_id,
       status,
       episodes_watched,
       updated_at
     FROM watchlist
     WHERE user_id = $1
       AND anime_id = $2`,
    [userId, animeId]
  );

  return result.rows[0] ?? null;
}


/**
 * Update the status on an existing watchlist entry identified by (user_id, anime_id).
 * Returns null if either id is invalid, or no matching entry exists.
 *
 * @param {string} userId - Internal UUID of the user
 * @param {string} animeId - Internal UUID of the anime
 * @param {string} status - New watchlist_status enum value
 * @returns {Promise<object|null>} The updated watchlist entry row, or null on miss
 */
export async function updateWatchlistStatus(userId, animeId, status) {
  if (!UUID_REGEX.test(userId) || !UUID_REGEX.test(animeId)) return null;

  const result = await query(
    `UPDATE watchlist
     SET status = $1
     WHERE user_id = $2
       AND anime_id = $3
     RETURNING *`,
    [status, userId, animeId]
  );

  return result.rows[0] ?? null;
}


/**
 * Remove an anime from a user's watchlist, identified by the (user_id, anime_id) pair.
 * Returns the deleted row, or null if either id is invalid or no entry exists.
 *
 * @param {string} userId - Internal UUID of the user
 * @param {string} animeId - Internal UUID of the anime
 * @returns {Promise<object|null>} The deleted watchlist entry row, or null on miss
 */
export async function removeFromWatchlist(userId, animeId) {
  if (!UUID_REGEX.test(userId) || !UUID_REGEX.test(animeId)) return null;

  const result = await query(
    `DELETE FROM watchlist
     WHERE user_id = $1
       AND anime_id = $2
     RETURNING *`,
    [userId, animeId]
  );

  return result.rows[0] ?? null;
}