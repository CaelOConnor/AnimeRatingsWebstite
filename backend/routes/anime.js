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

// ── GET /api/anime/search?q= ──────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim() === '') {
    return res.status(400).json({ error: 'q query parameter is required and cannot be empty.' });
  }

  try {
    const results = await searchAnimeByTitle(q.trim());
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

  try {
    let results = mode === 'recent'
      ? await getRecentlyCachedAnime(50)
      : await getTopRatedAnime(50);

    if (results.length === 0 && mode === 'top_rated') {
      results = await getRecentlyCachedAnime(50);
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

  try {
    const cached = await getAnimeByTmdbIdentifiers(tmdbId, tmdbType);
    if (cached) {
      return res.json(cached);
    }

    const tmdbData = await fetchFromTmdb(tmdbId, tmdbType);
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

async function fetchFromTmdb(tmdbId, tmdbType) {
  const TMDB_BASE_URL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) throw new Error('TMDB_API_KEY is not set');

  const typeSegment = tmdbType === 'movie' ? 'movie' : 'tv';

  // Fetch details and keywords in parallel
  const [data, keywordData] = await Promise.all([
    tmdbFetch(`${TMDB_BASE_URL}/${typeSegment}/${tmdbId}?language=en-US`, apiKey),
    tmdbFetch(`${TMDB_BASE_URL}/${typeSegment}/${tmdbId}/keywords`, apiKey),
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
      genres:        (data.genres ?? []).map(g => g.name),
    };
  }

  return {
    tmdbId:        data.id,
    tmdbType:      'tv',
    seasonNumber:  null,
    title:         data.name,
    originalTitle: data.original_name ?? null,
    overview:      data.overview ?? null,
    posterPath:    data.poster_path ?? null,
    backdropPath:  data.backdrop_path ?? null,
    episodeCount:  data.number_of_episodes ?? null,
    seasonCount:   data.number_of_seasons ?? null,
    status:        data.status ?? null,
    firstAirDate:  data.first_air_date ?? null,
    genres:        (data.genres ?? []).map(g => g.name),
  };
}

export default router;