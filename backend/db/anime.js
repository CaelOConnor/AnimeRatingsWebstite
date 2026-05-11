// getAnimeByTmdbIdentifiers(tmdbId, tmdbType, seasonNumber)  -- cache lookup + specific item fetch
// upsertAnime(animeData)                                     -- insert or update, refreshes cached_at
// getAnimeById(id)                                           -- lookup by internal UUID
// getTopRatedAnime(limit, tmdbType = null)                   -- optional type filter
// getRecentlyCachedAnime(limit)                              -- ordered by cached_at DESC
// searchAnimeByTitle(query)                                  -- ILIKE on title only

// -- in backend/utils/utils.js
// isStale(cachedAt, ttlDays = 7)


//getAnimeByTmdbId

//upsertAnime

//getAnimeById


// isStale