import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchFromTmdb } from '../anime.js';

// ---------------------------------------------------------------------------
// These are pure unit tests against the TMDB client function itself — no DB,
// no HTTP server, no real network calls. global.fetch is stubbed per-test so
// we can assert exactly which TMDB endpoints get hit and control what they
// return.
// ---------------------------------------------------------------------------

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const ANIME_KEYWORD_ID = 210024;

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

function baseTvBody(overrides = {}) {
  return {
    id: 209867,
    name: "Frieren: Beyond Journey's End",
    original_name: "Sousou no Frieren",
    overview: 'A wizard reflects on mortality.',
    poster_path: '/base-poster.jpg',
    backdrop_path: '/base-backdrop.jpg',
    number_of_episodes: 28,
    number_of_seasons: 2,
    status: 'Ended',
    first_air_date: '2023-09-29',
    genres: [{ name: 'Animation' }, { name: 'Drama' }],
    adult: false,
    ...overrides,
  };
}

function baseMovieBody(overrides = {}) {
  return {
    id: 372058,
    title: 'Your Name.',
    original_title: 'Kimi no Na wa.',
    overview: 'Two teenagers share a profound, magical connection.',
    poster_path: '/movie-poster.jpg',
    backdrop_path: '/movie-backdrop.jpg',
    release_date: '2016-08-26',
    status: 'Released',
    genres: [{ name: 'Animation' }, { name: 'Drama' }],
    adult: false,
    ...overrides,
  };
}

function anieKeywordsBody(isAnime = true) {
  return { id: 209867, results: isAnime ? [{ id: ANIME_KEYWORD_ID, name: 'anime' }] : [] };
}

function movieKeywordsBody(isAnime = true) {
  return { id: 372058, keywords: isAnime ? [{ id: ANIME_KEYWORD_ID, name: 'anime' }] : [] };
}

function seasonBody(overrides = {}) {
  return {
    id: 1111,
    air_date: '2024-01-29',
    episode_count: 12,
    name: 'Season 2',
    season_number: 2,
    ...overrides,
  };
}

describe('fetchFromTmdb', () => {
  beforeEach(() => {
    process.env.TMDB_API_KEY = 'test-tmdb-key';
    process.env.TMDB_BASE_URL = TMDB_BASE_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('TV, no season (regression)', () => {
    it('calls only the base and keywords endpoints', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody());
        return jsonResponse(baseTvBody());
      });
      vi.stubGlobal('fetch', fetchMock);

      await fetchFromTmdb(209867, 'tv');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const urls = fetchMock.mock.calls.map(([url]) => url);
      expect(urls.some((u) => u.includes('/season/'))).toBe(false);
    });

    it('returns aggregate series data with seasonNumber null', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody());
        return jsonResponse(baseTvBody());
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchFromTmdb(209867, 'tv');

      expect(result.seasonNumber).toBeNull();
      expect(result.episodeCount).toBe(28);
      expect(result.firstAirDate).toBe('2023-09-29');
      expect(result.genres).toEqual(['Drama']);
    });

    // The "— All Seasons" suffix is NOT added here — fetchFromTmdb has no
    // DB access and can't know whether season-specific siblings exist for
    // this series. Suffixing is applied conditionally, as a side effect of
    // a season-specific fetch, in the route layer (see
    // ensureWholeSeriesTitleSuffixed in db/anime.js and its route-level
    // tests in animeRouteTest.test.js).
    it('does not suffix the whole-series title — that is decided at the route layer, not here', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody());
        return jsonResponse(baseTvBody());
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchFromTmdb(209867, 'tv');

      expect(result.title).toBe("Frieren: Beyond Journey's End");
    });
  });

  describe('TV, season provided', () => {
    it('additionally calls the season endpoint with the right URL', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/season/2')) return jsonResponse(seasonBody());
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody());
        return jsonResponse(baseTvBody());
      });
      vi.stubGlobal('fetch', fetchMock);

      await fetchFromTmdb(209867, 'tv', 2);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      const urls = fetchMock.mock.calls.map(([url]) => url);
      expect(urls.some((u) => u === `${TMDB_BASE_URL}/tv/209867/season/2?language=en-US`)).toBe(true);
    });

    it('uses the season-specific episode count and air date, not the aggregate ones', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/season/2')) return jsonResponse(seasonBody({ episode_count: 12, air_date: '2024-01-29' }));
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody());
        return jsonResponse(baseTvBody({ number_of_episodes: 28, first_air_date: '2023-09-29' }));
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchFromTmdb(209867, 'tv', 2);

      expect(result.episodeCount).toBe(12);
      expect(result.firstAirDate).toBe('2024-01-29');
      expect(result.seasonNumber).toBe(2);
    });

    it('falls back to episodes.length when the season response has no episode_count', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/season/2')) {
          return jsonResponse(seasonBody({ episode_count: undefined, episodes: new Array(11).fill({}) }));
        }
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody());
        return jsonResponse(baseTvBody());
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchFromTmdb(209867, 'tv', 2);

      expect(result.episodeCount).toBe(11);
    });

    it('builds the title as "<series> — <season name>" when the season has a name', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/season/2')) return jsonResponse(seasonBody({ name: 'Season 2' }));
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody());
        return jsonResponse(baseTvBody());
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchFromTmdb(209867, 'tv', 2);

      expect(result.title).toBe("Frieren: Beyond Journey's End — Season 2");
    });

    it('falls back to "<series> — Season <n>" when the season response has no name', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/season/2')) return jsonResponse(seasonBody({ name: undefined }));
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody());
        return jsonResponse(baseTvBody());
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchFromTmdb(209867, 'tv', 2);

      expect(result.title).toBe("Frieren: Beyond Journey's End — Season 2");
    });

    it('supports season 0 (specials)', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/season/0')) return jsonResponse(seasonBody({ season_number: 0, name: 'Specials', episode_count: 3 }));
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody());
        return jsonResponse(baseTvBody());
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchFromTmdb(209867, 'tv', 0);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.seasonNumber).toBe(0);
      expect(result.episodeCount).toBe(3);
    });

    it('still keeps seasonCount from the aggregate base endpoint', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/season/2')) return jsonResponse(seasonBody());
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody());
        return jsonResponse(baseTvBody({ number_of_seasons: 2 }));
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchFromTmdb(209867, 'tv', 2);

      expect(result.seasonCount).toBe(2);
    });

    it('uses the season\'s own poster when the season response has one', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/season/2')) {
          return jsonResponse(seasonBody({ poster_path: '/season-2-poster.jpg' }));
        }
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody());
        return jsonResponse(baseTvBody({ poster_path: '/series-poster.jpg', backdrop_path: '/series-backdrop.jpg' }));
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchFromTmdb(209867, 'tv', 2);

      expect(result.posterPath).toBe('/season-2-poster.jpg');
      // TMDB's season endpoint has no backdrop_path field — always falls back.
      expect(result.backdropPath).toBe('/series-backdrop.jpg');
    });

    it('falls back to the series poster when the season has no poster of its own', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/season/0')) {
          return jsonResponse(seasonBody({ season_number: 0, name: 'Specials', poster_path: null }));
        }
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody());
        return jsonResponse(baseTvBody({ poster_path: '/series-poster.jpg', backdrop_path: '/series-backdrop.jpg' }));
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchFromTmdb(209867, 'tv', 0);

      expect(result.posterPath).toBe('/series-poster.jpg');
      expect(result.backdropPath).toBe('/series-backdrop.jpg');
    });
  });

  describe('movie, season provided (ignored)', () => {
    it('does not call the season endpoint', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/keywords')) return jsonResponse(movieKeywordsBody());
        return jsonResponse(baseMovieBody());
      });
      vi.stubGlobal('fetch', fetchMock);

      await fetchFromTmdb(372058, 'movie', 2);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const urls = fetchMock.mock.calls.map(([url]) => url);
      expect(urls.some((u) => u.includes('/season/'))).toBe(false);
    });

    it('returns seasonNumber null regardless of the season argument', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/keywords')) return jsonResponse(movieKeywordsBody());
        return jsonResponse(baseMovieBody());
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchFromTmdb(372058, 'movie', 2);

      expect(result.seasonNumber).toBeNull();
      expect(result.title).toBe('Your Name.');
    });
  });

  describe('error handling still applies when a season is provided', () => {
    it('throws NOT_ANIME when the keyword check fails', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/season/2')) return jsonResponse(seasonBody());
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody(false));
        return jsonResponse(baseTvBody());
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(fetchFromTmdb(209867, 'tv', 2)).rejects.toThrow('NOT_ANIME');
    });

    it('throws ADULT_CONTENT when the base endpoint flags adult content', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/season/2')) return jsonResponse(seasonBody());
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody());
        return jsonResponse(baseTvBody({ adult: true }));
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(fetchFromTmdb(209867, 'tv', 2)).rejects.toThrow('ADULT_CONTENT');
    });

    it('throws TMDB_NOT_FOUND when the base endpoint 404s', async () => {
      const fetchMock = vi.fn(async (url) => {
        if (url.includes('/season/2')) return jsonResponse(seasonBody());
        if (url.includes('/keywords')) return jsonResponse(anieKeywordsBody());
        return { ok: false, status: 404, json: async () => ({}) };
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(fetchFromTmdb(209867, 'tv', 2)).rejects.toThrow('TMDB_NOT_FOUND');
    });
  });
});
