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

// ── GET /api/anime/search?q= ──────────────────────────────────────────────────
// Public. Full-text search against cached anime titles.

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
// Public. Returns a list of anime from the local cache.
// mode=top_rated (default) — sorted by average review rating DESC
// mode=recent              — sorted by cached_at DESC

router.get('/browse', async (req, res) => {
  const mode = req.query.mode ?? 'top_rated';

  if (!VALID_BROWSE_MODES.has(mode)) {
    return res.status(400).json({
      error: `Invalid mode. Must be one of: ${[...VALID_BROWSE_MODES].join(', ')}.`,
    });
  }

  try {
    const results =
      mode === 'recent'
        ? await getRecentlyCachedAnime()
        : await getTopRatedAnime();

    res.json(results);
  } catch (err) {
    console.error('[GET /api/anime/browse]', err);
    res.status(500).json({ error: 'Failed to fetch anime.' });
  }
});

// ── GET /api/anime/:id ────────────────────────────────────────────────────────
// Public. Returns a single anime by its internal DB id.

router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'id must be an integer.' });
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
// Auth required. Cache-on-first-fetch: if the anime is already in our DB,
// return it immediately. Otherwise hit the TMDB API, upsert the result, and
// return the saved record.
//
// tmdbType defaults to 'tv' — pass ?type=movie for films.

router.post('/fetch/:tmdbId', authenticateToken, async (req, res) => {
  const tmdbId = parseInt(req.params.tmdbId, 10);

  if (isNaN(tmdbId)) {
    return res.status(400).json({ error: 'tmdbId must be an integer.' });
  }

  const tmdbType = req.query.type === 'movie' ? 'movie' : 'tv';

  try {
    // ── Cache hit ──────────────────────────────────────────────────────────
    const cached = await getAnimeByTmdbIdentifiers(tmdbId, tmdbType);
    if (cached) {
      return res.json(cached);
    }

    // ── Cache miss — fetch from TMDB ───────────────────────────────────────
    // TODO: replace this stub with a real TMDB client call once the
    // integration is wired up. The client should return a normalised object
    // matching the shape expected by upsertAnime.
    const tmdbData = await fetchFromTmdb(tmdbId, tmdbType); // throws if not found
    const anime = await upsertAnime(tmdbData);
    res.status(201).json(anime);
  } catch (err) {
    if (err.message === 'TMDB_NOT_FOUND') {
      return res.status(404).json({ error: 'Anime not found on TMDB.' });
    }
    console.error('[POST /api/anime/fetch/:tmdbId]', err);
    res.status(500).json({ error: 'Failed to fetch anime from TMDB.' });
  }
});

// ---------------------------------------------------------------------------
// TMDB fetch stub
// ---------------------------------------------------------------------------
// Replace this with your real TMDB client module once it exists.
// Expected return shape mirrors the upsertAnime parameter object.

async function fetchFromTmdb(tmdbId, tmdbType) {
  // TODO: import and call your TMDB client here, e.g.:
  //   import { fetchTmdbAnime } from '../services/tmdb.js';
  //   return fetchTmdbAnime(tmdbId, tmdbType);
  throw new Error('TMDB client not yet implemented.');
}

export default router;