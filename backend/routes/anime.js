import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getAnimeById,
  getAnimeByTmdbIdentifiers,
  searchAnimeByTitle,
  getRecentlyCachedAnime,
  getTopRatedAnime,
  upsertAnime,
} from '../db/anime.js';

const router = Router();

const VALID_BROWSE_MODES = new Set(['top_rated', 'recent']);
const TMDB_ANIME_KEYWORD_ID = 210024;

const VALID_SEASONS = new Set(['winter', 'spring', 'summer', 'fall']);

// Merged union of TMDB tv + movie genre sets. Anime entries typically only
// use a subset of these, but both fetch paths can write any of them.
const VALID_GENRES = new Set([
  'Action & Adventure', 'Comedy', 'Crime', 'Documentary', 'Drama',
  'Family', 'Kids', 'Mystery', 'Sci-Fi & Fantasy', 'War & Politics',
  'Western',
]);

/**
 * parseAnimeFilters
 * ------------------
 * Validates and normalizes optional season/year/genre query params shared
 * by /search and /browse. Returns { filters } on success or { error } with
 * a user-facing message on the first invalid value found.
 *
 * - season: case-insensitive, must be one of VALID_SEASONS
 * - year:   must be a 4-digit integer in a sane range
 * - genre:  repeatable query param (?genre=A&genre=B); each value must be
 *           a known TMDB genre. Normalized to an array for the db layer's
 *           array-overlap (OR match) filtering.
 */
function parseAnimeFilters(query) {
  const filters = {};

  if (query.season !== undefined) {
    const season = String(query.season).toLowerCase();
    if (!VALID_SEASONS.has(season)) {
      return { error: `Invalid season. Must be one of: ${[...VALID_SEASONS].join(', ')}.` };
    }
    filters.season = season;
  }

  if (query.year !== undefined) {
    const rawYear = String(query.year).trim();
    const year = parseInt(rawYear, 10);
    if (!/^\d{4}$/.test(rawYear) || isNaN(year) || year < 1900 || year > 2100) {
      return { error: 'year must be a valid 4-digit year.' };
    }
    filters.year = year;
  }

  if (query.genre !== undefined) {
    const genres = Array.isArray(query.genre) ? query.genre : [query.genre];
    for (const g of genres) {
      if (!VALID_GENRES.has(g)) {
        return { error: `Invalid genre: "${g}".` };
      }
    }
    filters.genres = genres;
  }

  return { filters };
}

// ── GET /api/anime/search?q= ──────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim() === '') {
    return res.status(400).json({ error: 'q query parameter is required and cannot be empty.' });
  }

  const { filters, error } = parseAnimeFilters(req.query);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const results = await searchAnimeByTitle(q.trim(), filters);
    res.json(results);
  } catch (err) {
    console.error('[GET /api/anime/search]', err);
    res.status(500).json({ error: 'Failed to search anime.' });
  }
});

// ── GET /api/anime/browse?mode= ───────────────────────────────────────────────
router.get('/browse', async (req, res) => {
  const mode = req.query.mode ?? 'top_rated';

  if (!VALID_BROWSE_MODES.has(mode)) {
    return res.status(400).json({
      error: `Invalid mode. Must be one of: ${[...VALID_BROWSE_MODES].join(', ')}.`,
    });
  }

  const { filters, error } = parseAnimeFilters(req.query);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    let results = mode === 'recent'
      ? await getRecentlyCachedAnime(50, filters)
      : await getTopRatedAnime(50, null, filters);

    if (results.length === 0 && mode === 'top_rated') {
      results = await getRecentlyCachedAnime(50, filters);
    }

    res.json(results);
  } catch (err) {
    console.error('[GET /api/anime/browse]', err);
    res.status(500).json({ error: 'Failed to fetch anime.' });
  }
});

// ── GET /api/anime/:id ────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  try {
    const anime = await getAnimeById(id);
    if (!anime) {
      return res.status(404).json({ error: 'Anime not found.' });
    }
    res.json(anime);
  } catch (err) {
    console.error('[GET /api/anime/:id]', err);
    res.status(500).json({ error: 'Failed to fetch anime.' });
  }
});

// ── POST /api/anime/fetch/:tmdbId ─────────────────────────────────────────────
router.post('/fetch/:tmdbId', authenticateToken, async (req, res) => {
  const tmdbId = parseInt(req.params.tmdbId, 10);

  if (isNaN(tmdbId)) {
    return res.status(400).json({ error: 'tmdbId must be an integer.' });
  }

  const tmdbType = req.query.type === 'movie' ? 'movie' : 'tv';

  // Movies don't have seasons, so a season param is silently ignored for
  // them rather than treated as an error.
  let seasonNumber = null;
  if (req.query.season !== undefined) {
    const rawSeason = String(req.query.season).trim();
    if (!/^\d+$/.test(rawSeason)) {
      return res.status(400).json({ error: 'season must be a non-negative integer.' });
    }
    if (tmdbType === 'tv') {
      seasonNumber = parseInt(rawSeason, 10);
    }
  }

  try {
    const cached = await getAnimeByTmdbIdentifiers(tmdbId, tmdbType, seasonNumber);
    if (cached) {
      return res.json(cached);
    }

    const tmdbData = await fetchFromTmdb(tmdbId, tmdbType, seasonNumber);
    const anime = await upsertAnime(tmdbData);
    res.status(201).json(anime);
  } catch (err) {
    if (err.message === 'TMDB_NOT_FOUND') {
      return res.status(404).json({ error: 'Anime not found on TMDB.' });
    }
    if (err.message === 'NOT_ANIME') {
      return res.status(422).json({ error: 'Title is not tagged as anime on TMDB.' });
    }
    if (err.message === 'ADULT_CONTENT') {
      return res.status(422).json({ error: 'Title is flagged as adult content.' });
    }
    console.error('[POST /api/anime/fetch/:tmdbId]', err);
    res.status(500).json({ error: 'Failed to fetch anime from TMDB.' });
  }
});

// ── TMDB client ───────────────────────────────────────────────────────────────

async function tmdbFetch(url, apiKey) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  if (res.status === 404) throw new Error('TMDB_NOT_FOUND');
  if (!res.ok) throw new Error(`TMDB API error: ${res.status}`);
  return res.json();
}

export async function fetchFromTmdb(tmdbId, tmdbType, seasonNumber = null) {
  const TMDB_BASE_URL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) throw new Error('TMDB_API_KEY is not set');

  const typeSegment = tmdbType === 'movie' ? 'movie' : 'tv';

  // Movies don't have seasons — only fetch season-specific data for TV.
  const fetchSeason = typeSegment === 'tv' && seasonNumber !== null && seasonNumber !== undefined;

  // Fetch details, keywords, and (optionally) season data in parallel
  const [data, keywordData, seasonData] = await Promise.all([
    tmdbFetch(`${TMDB_BASE_URL}/${typeSegment}/${tmdbId}?language=en-US`, apiKey),
    tmdbFetch(`${TMDB_BASE_URL}/${typeSegment}/${tmdbId}/keywords`, apiKey),
    fetchSeason
      ? tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}/season/${seasonNumber}?language=en-US`, apiKey)
      : Promise.resolve(null),
  ]);

  // Block adult content
  if (data.adult === true) {
    throw new Error('ADULT_CONTENT');
  }

  // Check for anime keyword — movies use `keywords`, TV uses `results`
  const keywords = keywordData.keywords ?? keywordData.results ?? [];
  const isAnime = keywords.some(k => k.id === TMDB_ANIME_KEYWORD_ID);
  if (!isAnime) {
    throw new Error('NOT_ANIME');
  }

  if (tmdbType === 'movie') {
    return {
      tmdbId:        data.id,
      tmdbType:      'movie',
      seasonNumber:  null,
      title:         data.title,
      originalTitle: data.original_title ?? null,
      overview:      data.overview ?? null,
      posterPath:    data.poster_path ?? null,
      backdropPath:  data.backdrop_path ?? null,
      episodeCount:  null,
      seasonCount:   null,
      status:        data.status ?? null,
      firstAirDate:  data.release_date ?? null,
      genres:        (data.genres ?? []).map(g => g.name).filter(g => g !== 'Animation'),
    };
  }

  // Season-specific overrides: episode count and air date come from the
  // season itself, not the series-aggregate base endpoint. Title gets the
  // season name appended so two season-cards for the same show don't look
  // identical in a list.
  const title = fetchSeason
    ? `${data.name} — ${seasonData.name || `Season ${seasonNumber}`}`
    : data.name;
  const episodeCount = fetchSeason
    ? (seasonData.episode_count ?? seasonData.episodes?.length ?? null)
    : (data.number_of_episodes ?? null);
  const firstAirDate = fetchSeason
    ? (seasonData.air_date ?? null)
    : (data.first_air_date ?? null);
  // TMDB's season endpoint only ever has poster_path, never backdrop_path —
  // backdropPath effectively always falls back to the series backdrop.
  const posterPath = fetchSeason
    ? (seasonData.poster_path ?? data.poster_path ?? null)
    : (data.poster_path ?? null);
  const backdropPath = fetchSeason
    ? (seasonData.backdrop_path ?? data.backdrop_path ?? null)
    : (data.backdrop_path ?? null);

  return {
    tmdbId:        data.id,
    tmdbType:      'tv',
    seasonNumber:  fetchSeason ? seasonNumber : null,
    title,
    originalTitle: data.original_name ?? null,
    overview:      data.overview ?? null,
    posterPath,
    backdropPath,
    episodeCount,
    seasonCount:   data.number_of_seasons ?? null,
    status:        data.status ?? null,
    firstAirDate,
    genres:        (data.genres ?? []).map(g => g.name).filter(g => g !== 'Animation'),
  };
}

const SEARCH_RESULTS_LIMIT = 8;

function toYear(dateStr) {
  return dateStr ? new Date(dateStr).getFullYear() : null;
}

function toCandidate(result, mediaType) {
  return {
    id: result.id,
    title: mediaType === 'movie' ? result.title : result.name,
    year: toYear(mediaType === 'movie' ? result.release_date : result.first_air_date),
    posterPath: result.poster_path ?? null,
    mediaType,
  };
}

/**
 * searchTmdbCandidates
 * --------------------
 * Admin "add a show" lookup helper — not gated by the anime keyword the way
 * fetchFromTmdb is, since this only previews candidates for a human to pick
 * from; the actual anime/adult checks still happen when POST /fetch/:tmdbId
 * is called to add the pick.
 *
 * A purely numeric query is treated as a direct TMDB id lookup (tries /tv
 * first, falls back to /movie) instead of a title search, so admins can
 * paste a raw id and get a single confirm-candidate back.
 */
export async function searchTmdbCandidates(query) {
  const TMDB_BASE_URL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) throw new Error('TMDB_API_KEY is not set');

  if (/^\d+$/.test(query)) {
    try {
      const data = await tmdbFetch(`${TMDB_BASE_URL}/tv/${query}?language=en-US`, apiKey);
      return data.adult ? [] : [toCandidate(data, 'tv')];
    } catch (err) {
      if (err.message !== 'TMDB_NOT_FOUND') throw err;
    }
    try {
      const data = await tmdbFetch(`${TMDB_BASE_URL}/movie/${query}?language=en-US`, apiKey);
      return data.adult ? [] : [toCandidate(data, 'movie')];
    } catch (err) {
      if (err.message === 'TMDB_NOT_FOUND') return [];
      throw err;
    }
  }

  const data = await tmdbFetch(
    `${TMDB_BASE_URL}/search/multi?query=${encodeURIComponent(query)}&language=en-US&page=1`,
    apiKey
  );
  return (data.results ?? [])
    .filter(r => (r.media_type === 'tv' || r.media_type === 'movie') && r.adult !== true)
    .slice(0, SEARCH_RESULTS_LIMIT)
    .map(r => toCandidate(r, r.media_type));
}

export default router;