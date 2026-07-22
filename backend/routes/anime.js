import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getAnimeById,
  getAnimeByTmdbIdentifiers,
  searchAnimeByTitle,
  getRecentlyCachedAnime,
  getTopRatedAnime,
  upsertAnime,
  ensureWholeSeriesTitleSuffixed,
} from '../db/anime.js';

const router = Router();

// Batch size shared by /browse and /search pagination — reusing the value
// that was already the (previously unintentional) hard cap on /browse.
const BATCH_SIZE = 50;

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

/**
 * parseOffset
 * -----------
 * Validates the optional `offset` query param shared by /search and
 * /browse. Defaults to 0. Returns { offset } on success or { error } with a
 * user-facing message.
 */
function parseOffset(query) {
  if (query.offset === undefined) {
    return { offset: 0 };
  }
  const raw = String(query.offset).trim();
  if (!/^\d+$/.test(raw)) {
    return { error: 'offset must be a non-negative integer.' };
  }
  return { offset: parseInt(raw, 10) };
}

/**
 * paginate
 * --------
 * Given rows fetched with a limit of BATCH_SIZE + 1, splits them into the
 * page to return and whether more rows exist beyond it — avoiding a
 * separate COUNT query.
 */
function paginate(rows) {
  return {
    results: rows.slice(0, BATCH_SIZE),
    hasMore: rows.length > BATCH_SIZE,
  };
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

  const { offset, error: offsetError } = parseOffset(req.query);
  if (offsetError) {
    return res.status(400).json({ error: offsetError });
  }

  try {
    const rows = await searchAnimeByTitle(q.trim(), filters, BATCH_SIZE + 1, offset);
    res.json(paginate(rows));
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

  const { offset, error: offsetError } = parseOffset(req.query);
  if (offsetError) {
    return res.status(400).json({ error: offsetError });
  }

  try {
    let effectiveMode = mode;
    let rows = mode === 'recent'
      ? await getRecentlyCachedAnime(BATCH_SIZE + 1, filters, offset)
      : await getTopRatedAnime(BATCH_SIZE + 1, null, filters, offset);

    // Only re-check the "nothing reviewed yet" fallback on the first page —
    // on later pages an empty top_rated result just means pagination has
    // reached the end of a real (non-empty) top_rated list.
    if (rows.length === 0 && mode === 'top_rated' && offset === 0) {
      rows = await getRecentlyCachedAnime(BATCH_SIZE + 1, filters, offset);
      effectiveMode = 'recent';
    }

    res.json({ ...paginate(rows), mode: effectiveMode });
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
      // Whether the whole-series row should say "All Seasons" can change
      // over time — a season sibling might get fetched later, or (as with
      // Vinland Saga in practice) the whole-series row might get (re)fetched
      // *after* a season sibling already exists. Runs on every fetch, cache
      // hit or not, and reflects the fix in this response if the row being
      // returned is the one that just got suffixed.
      const updated = await ensureWholeSeriesTitleSuffixed(tmdbId, tmdbType);
      const responseAnime = updated?.id === cached.id ? updated : cached;
      return res.json(responseAnime);
    }

    const tmdbData = await fetchFromTmdb(tmdbId, tmdbType, seasonNumber);
    const anime = await upsertAnime(tmdbData);
    const updated = await ensureWholeSeriesTitleSuffixed(tmdbId, tmdbType);
    const responseAnime = updated?.id === anime.id ? updated : anime;
    res.status(201).json(responseAnime);
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
  // season name appended so cards for the same show never look identical
  // in a list. The whole-series row stays bare here — whether it should
  // say "All Seasons" depends on whether season-specific siblings exist,
  // which fetchFromTmdb (no DB access) can't know. That's decided in the
  // route layer via ensureWholeSeriesTitleSuffixed (db/anime.js), applied
  // as a side effect whenever a season-specific fetch succeeds.
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