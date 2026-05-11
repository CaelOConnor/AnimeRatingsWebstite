// getAnimeByTmdbIdentifiers(tmdbId, tmdbType, seasonNumber)  -- cache lookup + specific item fetch
// upsertAnime(animeData)                                     -- insert or update, refreshes cached_at
// getAnimeById(id)                                           -- lookup by internal UUID
// getTopRatedAnime(limit, tmdbType = null)                   -- optional type filter
// getRecentlyCachedAnime(limit)                              -- ordered by cached_at DESC
// searchAnimeByTitle(query)                                  -- ILIKE on title only

import { query } from './db.js';

/**
 * getAnimeByTmdbIdentifiers
 * -------------------------
 * Finds a cached anime row using the TMDB identifiers.
 *
 * This is the core cache lookup function used before making
 * requests to the TMDB API.
 *
 * IMPORTANT:
 * season_number can be NULL for "whole series" entries.
 * Since Postgres treats NULL != NULL in comparisons,
 * we must handle NULL explicitly in the WHERE clause.
 *
 * Examples:
 * - Entire show:
 *     tmdb_id = 1399
 *     tmdb_type = 'tv'
 *     season_number = null
 *
 * - Specific season:
 *     tmdb_id = 1399
 *     tmdb_type = 'tv'
 *     season_number = 1
 *
 * @param {number} tmdbId
 * @param {'tv' | 'movie'} tmdbType
 * @param {number|null} seasonNumber
 *
 * @returns {Promise<object|null>}
 * Returns the anime row if found, otherwise null.
 */

export async function getAnimeByTmdbIdentifiers(
  tmdbId,
  tmdbType,
  seasonNumber = null
) {
  // Validate required inputs before touching the DB
  if (tmdbId === undefined || tmdbId === null) {
    throw new Error('tmdbId is required');
  }

  if (!tmdbType) {
    throw new Error('tmdbType is required');
  }

  // NULL = NULL -> returns NULL, not TRUE
  // So for whole-series rows we explicitly check: season_number IS NULL AND $3 IS NULL
  const result = await query(
    `SELECT id, tmdb_id, tmdb_type, season_number, title, original_title, overview, poster_path, backdrop_path, episode_count,
        season_count, status, first_air_date, genres,cached_at
    FROM anime
    WHERE tmdb_id = $1 AND tmdb_type = $2 AND ( season_number = $3 OR ( season_number IS NULL AND $3 IS NULL ) )
    LIMIT 1`,
    [tmdbId, tmdbType, seasonNumber]
  );

  // Return the anime row, or null if nothing matched
  return result.rows[0] ?? null;
}