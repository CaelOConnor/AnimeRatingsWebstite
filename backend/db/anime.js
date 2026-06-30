// getAnimeByTmdbIdentifiers(tmdbId, tmdbType, seasonNumber)  -- cache lookup + specific item fetch
// upsertAnime(animeData)                                     -- insert or update, refreshes cached_at
// getAnimeById(id)                                           -- lookup by internal UUID
// getTopRatedAnime(limit, tmdbType = null)                   -- optional type filter
// getRecentlyCachedAnime(limit)                              -- ordered by cached_at DESC
// searchAnimeByTitle(query)                                  -- ILIKE on title only


// getTopRatedAnime(limit, tmdbType) — most complex of the three, JOINs with reviews to compute AVG rating. Worth doing while you're still deep in anime.js.
// getRecentlyCachedAnime(limit) — trivial, just ORDER BY cached_at DESC.
// searchAnimeByTitle(query) — ILIKE on title, also simple.

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
        season_count, status, first_air_date, genres, cached_at
    FROM anime
    WHERE tmdb_id = $1 AND tmdb_type = $2 AND ( season_number = $3 OR ( season_number IS NULL AND $3 IS NULL ) )
    LIMIT 1`,
    [tmdbId, tmdbType, seasonNumber]
  );

  // Return the anime row, or null if nothing matched
  return result.rows[0] ?? null;
}


// upsertAnime(animeData) 
/**
 * upsertAnime
 * -----------
 * Inserts a new anime row, or updates it if one already exists for the
 * same (tmdbId, tmdbType, seasonNumber) combination. Always refreshes
 * cached_at so the caller can use isStale() to decide when to re-fetch.
 *
 * NULL season_number caveat:
 * Postgres UNIQUE indexes treat every NULL as distinct from every other
 * NULL, so two whole-series rows (season_number = NULL) for the same
 * tmdbId would NOT conflict at the DB level. We handle this explicitly:
 * for NULL season_number rows we do a manual fetch-then-insert-or-update
 * rather than relying on ON CONFLICT alone.
 *
 * For non-null season_number rows the standard INSERT ... ON CONFLICT
 * DO UPDATE path is used — the unique index on
 * (tmdb_id, tmdb_type, season_number) handles those correctly.
 *
 * @param {object} animeData
 * @param {number}      animeData.tmdbId
 * @param {'tv'|'movie'} animeData.tmdbType
 * @param {number|null} animeData.seasonNumber
 * @param {string}      animeData.title
 * @param {string|null} animeData.originalTitle
 * @param {string|null} animeData.overview
 * @param {string|null} animeData.posterPath
 * @param {string|null} animeData.backdropPath
 * @param {number|null} animeData.episodeCount
 * @param {number|null} animeData.seasonCount
 * @param {string|null} animeData.status
 * @param {string|null} animeData.firstAirDate   ISO date string or null
 * @param {string[]}    animeData.genres          Defaults to []
 *
 * @returns {Promise<object>} The inserted or updated anime row.
 */
export async function upsertAnime({
  tmdbId,
  tmdbType,
  seasonNumber = null,
  title,
  originalTitle = null,
  overview = null,
  posterPath = null,
  backdropPath = null,
  episodeCount = null,
  seasonCount = null,
  status = null,
  firstAirDate = null,
  genres = [],
}) {
  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------
  if (tmdbId === undefined || tmdbId === null) {
    throw new Error('tmdbId is required');
  }
  if (!tmdbType) {
    throw new Error('tmdbType is required');
  }
  if (!title) {
    throw new Error('title is required');
  }

  // ------------------------------------------------------------------
  // NULL season_number path
  // The DB unique index won't catch duplicate whole-series rows, so we
  // handle the conflict manually: check for an existing row first, then
  // UPDATE or INSERT accordingly.
  // ------------------------------------------------------------------
  if (seasonNumber === null) {
    return await upsertWholeSeries({
      tmdbId, tmdbType, title, originalTitle, overview,
      posterPath, backdropPath, episodeCount, seasonCount,
      status, firstAirDate, genres,
    });
  }

  // ------------------------------------------------------------------
  // Non-null season_number path
  // Standard INSERT ... ON CONFLICT DO UPDATE — the unique index on
  // (tmdb_id, tmdb_type, season_number) handles deduplication.
  // ------------------------------------------------------------------
  const result = await query(
    `INSERT INTO anime (
      tmdb_id, tmdb_type, season_number, title, original_title, overview,
      poster_path, backdrop_path, episode_count, season_count, status,
      first_air_date, genres, cached_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, NOW()
    )
    ON CONFLICT (tmdb_id, tmdb_type, season_number) DO UPDATE SET
      title          = EXCLUDED.title,
      original_title = EXCLUDED.original_title,
      overview       = EXCLUDED.overview,
      poster_path    = EXCLUDED.poster_path,
      backdrop_path  = EXCLUDED.backdrop_path,
      episode_count  = EXCLUDED.episode_count,
      season_count   = EXCLUDED.season_count,
      status         = EXCLUDED.status,
      first_air_date = EXCLUDED.first_air_date,
      genres         = EXCLUDED.genres,
      cached_at      = NOW()
    RETURNING
      id, tmdb_id, tmdb_type, season_number, title, original_title,
      overview, poster_path, backdrop_path, episode_count, season_count,
      status, first_air_date, genres, cached_at`,
    [
      tmdbId, tmdbType, seasonNumber, title, originalTitle, overview,
      posterPath, backdropPath, episodeCount, seasonCount, status,
      firstAirDate, genres,
    ]
  );

  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Private helper — handles the NULL season_number case manually
// ---------------------------------------------------------------------------

async function upsertWholeSeries({
  tmdbId, tmdbType, title, originalTitle, overview,
  posterPath, backdropPath, episodeCount, seasonCount,
  status, firstAirDate, genres,
}) {
  // Check if a whole-series row already exists for this tmdbId + tmdbType
  const existing = await query(
    `SELECT id FROM anime
     WHERE tmdb_id = $1 AND tmdb_type = $2 AND season_number IS NULL`,
    [tmdbId, tmdbType]
  );

  if (existing.rows.length > 0) {
    // Row exists — UPDATE it
    const result = await query(
      `UPDATE anime SET
        title          = $1,
        original_title = $2,
        overview       = $3,
        poster_path    = $4,
        backdrop_path  = $5,
        episode_count  = $6,
        season_count   = $7,
        status         = $8,
        first_air_date = $9,
        genres         = $10,
        cached_at      = NOW()
      WHERE tmdb_id = $11 AND tmdb_type = $12 AND season_number IS NULL
      RETURNING
        id, tmdb_id, tmdb_type, season_number, title, original_title,
        overview, poster_path, backdrop_path, episode_count, season_count,
        status, first_air_date, genres, cached_at`,
      [
        title, originalTitle, overview, posterPath, backdropPath,
        episodeCount, seasonCount, status, firstAirDate, genres,
        tmdbId, tmdbType,
      ]
    );
    return result.rows[0];
  }

  // No existing row — INSERT fresh
  const result = await query(
    `INSERT INTO anime (
      tmdb_id, tmdb_type, season_number, title, original_title, overview,
      poster_path, backdrop_path, episode_count, season_count, status,
      first_air_date, genres, cached_at
    ) VALUES (
      $1, $2, NULL, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, NOW()
    )
    RETURNING
      id, tmdb_id, tmdb_type, season_number, title, original_title,
      overview, poster_path, backdrop_path, episode_count, season_count,
      status, first_air_date, genres, cached_at`,
    [
      tmdbId, tmdbType, title, originalTitle, overview,
      posterPath, backdropPath, episodeCount, seasonCount, status,
      firstAirDate, genres,
    ]
  );
  return result.rows[0];
}


// get anime by id 
/**
 * getAnimeById
 * ------------
 * Fetches a single anime row by its internal UUID.
 *
 * This is used everywhere else in the DB layer — reviews, watchlist,
 * and comments all reference anime by internal UUID, not tmdb_id.
 *
 * @param {string} id - Internal UUID primary key
 * @returns {Promise<object|null>} The anime row, or null if not found.
 */
export async function getAnimeById(id) {
  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------
  if (id === undefined || id === null) {
    throw new Error('id is required');
  }


  // ------------------------------------------------------------------
  // Query
  // ------------------------------------------------------------------
  const result = await query(
    `SELECT
      id, tmdb_id, tmdb_type, season_number, title, original_title,
      overview, poster_path, backdrop_path, episode_count, season_count,
      status, first_air_date, genres, cached_at
    FROM anime
    WHERE id = $1`,
    [id]
  );

  return result.rows[0] ?? null;
}


// ---------------------------------------------------------------------------
// Shared helper — appends optional season/year/genre filters to a WHERE
// clause and pushes the corresponding params. Used by getTopRatedAnime,
// getRecentlyCachedAnime, and searchAnimeByTitle so all three filter
// identically.
//
// season:  'winter' | 'spring' | 'summer' | 'fall' — derived from the month
//          of first_air_date via CASE. Rows with a null first_air_date
//          naturally fail this comparison (NULL = anything is NULL, not
//          true), so they're correctly excluded whenever season is given.
// year:    matched against EXTRACT(YEAR FROM first_air_date). Same null
//          behavior applies.
// genres:  string[] — matched via array overlap (&&), i.e. "match ANY".
//
// No validation here — unknown season/genre strings are the route layer's
// responsibility. This stays permissive and just filters on what it's given.
// ---------------------------------------------------------------------------
function buildAnimeFilters(params, filters = {}, alias = 'a') {
  const { season, year, genres } = filters;
  let clause = '';

  if (season) {
    const seasonCase = `
      CASE
        WHEN EXTRACT(MONTH FROM ${alias}.first_air_date) IN (1,2,3)    THEN 'winter'
        WHEN EXTRACT(MONTH FROM ${alias}.first_air_date) IN (4,5,6)    THEN 'spring'
        WHEN EXTRACT(MONTH FROM ${alias}.first_air_date) IN (7,8,9)    THEN 'summer'
        WHEN EXTRACT(MONTH FROM ${alias}.first_air_date) IN (10,11,12) THEN 'fall'
      END`;
    clause += ` AND ${seasonCase} = $${params.push(season)}`;
  }

  if (year) {
    clause += ` AND EXTRACT(YEAR FROM ${alias}.first_air_date) = $${params.push(year)}`;
  }

  if (genres && genres.length > 0) {
    clause += ` AND ${alias}.genres && $${params.push(genres)}::text[]`;
  }

  return clause;
}

// get top rated anime
/**
 * getTopRatedAnime
 * ----------------
 * Returns anime ranked by average user rating, highest first.
 * Only anime that have at least one review are included.
 *
 * Optionally filters by tmdb_type — pass 'tv' or 'movie' to scope
 * results to one type, or omit / pass null to return both.
 *
 * Returns two computed columns alongside the standard anime fields:
 *   - average_rating  NUMERIC  AVG of all ratings for that anime
 *   - review_count    BIGINT   total number of reviews
 *
 * @param {number}           limit     Maximum number of rows to return. Required, must be >= 1.
 * @param {'tv'|'movie'|null} tmdbType  Optional type filter. Null returns all types.
 *
 * @returns {Promise<object[]>}
 */
export async function getTopRatedAnime(limit, tmdbType = null, filters = {}) {
  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------
  if (limit === undefined || limit === null) {
    throw new Error('limit is required');
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('limit must be a positive integer');
  }

  // ------------------------------------------------------------------
  // Query
  // Dynamic WHERE clause: only add the tmdb_type filter when provided.
  // Parameterised to avoid any injection risk even on a trusted value.
  // ------------------------------------------------------------------
  const params = [limit];
  const typeFilter = tmdbType ? `AND a.tmdb_type = $${params.push(tmdbType)}` : '';
  const advancedFilter = buildAnimeFilters(params, filters, 'a');

  const result = await query(
    `SELECT
      a.id,
      a.tmdb_id,
      a.tmdb_type,
      a.season_number,
      a.title,
      a.original_title,
      a.overview,
      a.poster_path,
      a.backdrop_path,
      a.episode_count,
      a.season_count,
      a.status,
      a.first_air_date,
      a.genres,
      a.cached_at,
      ROUND(AVG(r.rating), 2) AS average_rating,
      COUNT(r.id)             AS review_count
    FROM anime a
    INNER JOIN reviews r ON r.anime_id = a.id
    WHERE 1=1 ${typeFilter} ${advancedFilter}
    GROUP BY a.id
    ORDER BY average_rating DESC
    LIMIT $1`,
    params
  );

  return result.rows;
}


// get recently cached anime
/**
 * getRecentlyCachedAnime
 * ----------------------
 * Returns the most recently cached anime rows, newest first.
 * Useful for a "recently added" feed on the frontend.
 *
 * @param {number} limit  Maximum number of rows to return. Required, must be >= 1.
 *
 * @returns {Promise<object[]>}
 */
export async function getRecentlyCachedAnime(limit, filters = {}) {
  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------
  if (limit === undefined || limit === null) {
    throw new Error('limit is required');
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('limit must be a positive integer');
  }

  // ------------------------------------------------------------------
  // Query
  // ------------------------------------------------------------------
  const params = [limit];
  const advancedFilter = buildAnimeFilters(params, filters, 'a');

  const result = await query(
    `SELECT
      a.id, a.tmdb_id, a.tmdb_type, a.season_number, a.title, a.original_title,
      a.overview, a.poster_path, a.backdrop_path, a.episode_count, a.season_count,
      a.status, a.first_air_date, a.genres, a.cached_at,
      ROUND(AVG(r.rating), 2) AS average_rating,
      COUNT(r.id)             AS review_count
    FROM anime a
    LEFT JOIN reviews r ON r.anime_id = a.id
    WHERE 1=1 ${advancedFilter}
    GROUP BY a.id
    ORDER BY a.cached_at DESC
    LIMIT $1`,
    params
  );

  return result.rows;
}


// search by title 
/**
 * searchAnimeByTitle
 * ------------------
 * Case-insensitive partial match search on the title column.
 * Searches English titles only — original_title is intentionally excluded.
 *
 * @param {string} searchQuery  The search string. Required, must not be empty or whitespace.
 *
 * @returns {Promise<object[]>}
 */
export async function searchAnimeByTitle(searchQuery, filters = {}) {
  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------
  if (searchQuery === undefined || searchQuery === null) {
    throw new Error('searchQuery is required');
  }
  if (typeof searchQuery !== 'string' || searchQuery.trim() === '') {
    throw new Error('searchQuery must be a non-empty string');
  }

  // ------------------------------------------------------------------
  // Query
  // Wrap the trimmed value in % wildcards for a contains match.
  // Parameterised — never interpolate user input directly into SQL.
  // ------------------------------------------------------------------
  const params = [`%${searchQuery.trim()}%`];
  const advancedFilter = buildAnimeFilters(params, filters, 'a');

  const result = await query(
    `SELECT
      a.id, a.tmdb_id, a.tmdb_type, a.season_number, a.title, a.original_title,
      a.overview, a.poster_path, a.backdrop_path, a.episode_count, a.season_count,
      a.status, a.first_air_date, a.genres, a.cached_at,
      ROUND(AVG(r.rating), 2) AS average_rating,
      COUNT(r.id)             AS review_count
    FROM anime a
    LEFT JOIN reviews r ON r.anime_id = a.id
    WHERE a.title ILIKE $1 ${advancedFilter}
    GROUP BY a.id
    ORDER BY a.title ASC`,
    params
  );

  return result.rows;
}