import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import AnimeGrid from '../components/anime/AnimeGrid';
import FilterBar from '../components/anime/FilterBar';
import './Home.css';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Build the query string used when filtering anime by season, year, and genre.
function buildQueryParams({ season, year, genres }) {
  const params = new URLSearchParams();
  if (season) params.set('season', season);
  if (year) params.set('year', year);
  genres.forEach((g) => params.append('genre', g));
  return params;
}

export default function Home() {
  // Receive the current search text and sort option from the shared layout (App.jsx).
  const { searchQuery, sortBy } = useOutletContext();

  // Store the anime currently being displayed along with the page's loading state.
  const [anime, setAnime]     = useState([]);
  const [loading, setLoading] = useState(true);       // initial/reset fetch (replaces the whole grid)
  const [loadingMore, setLoadingMore] = useState(false); // "load more" continuation (appends)
  const [error, setError]     = useState(null);
  const [hasMore, setHasMore] = useState(false);

  // Store the currently selected filters.
  const [season, setSeason] = useState(null);
  const [year, setYear]     = useState(null);
  const [genres, setGenres] = useState([]);

  // References used to debounce searches and coordinate requests.
  const debounceRef     = useRef(null);
  const abortRef        = useRef(null);  // in-flight request's AbortController
  const generationRef   = useRef(0);     // bumped on every filter/search/sort change
  const fetchingRef     = useRef(false); // synchronous guard against overlapping "load more" calls
  const offsetRef       = useRef(0);     // next offset to request
  const modeRef         = useRef(sortBy); // effective browse mode (may differ from sortBy after a top_rated->recent fallback)

  // Fetch one page of anime. isLoadMore appends to the existing list;
  // otherwise it replaces the list (a fresh search/filter/sort cycle).
  const fetchPage = useCallback(async ({ query, mode, filters, offset, generation, isLoadMore }) => {
    if (isLoadMore) {
      if (fetchingRef.current) return; // a load-more request is already in flight — ignore this trigger
      fetchingRef.current = true;
      setLoadingMore(true);
    } else {
      // Starting a fresh cycle — cancel whatever request (initial or load-more) was in flight.
      if (abortRef.current) abortRef.current.abort();
      setLoading(true);
      setError(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const params = buildQueryParams(filters);
      params.set('offset', String(offset));

      let url;
      if (query) {
        params.set('q', query);
        url = `${BASE_URL}/api/anime/search?${params.toString()}`;
      } else {
        params.set('mode', mode);
        url = `${BASE_URL}/api/anime/browse?${params.toString()}`;
      }

      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();

      // A newer filter/search/sort cycle has already started — this response is stale.
      if (generation !== generationRef.current) return;

      const results = Array.isArray(data) ? data : (data.results ?? data.anime ?? []);
      const nextHasMore = Array.isArray(data) ? false : Boolean(data.hasMore);

      if (!query && data.mode) modeRef.current = data.mode;

      setAnime((prev) => (isLoadMore ? [...prev, ...results] : results));
      setHasMore(nextHasMore);
      offsetRef.current = offset + results.length;
    } catch (err) {
      // Ignore cancelled requests, but display an error for any other failure.
      if (err.name !== 'AbortError' && generation === generationRef.current) {
        console.error('Home fetch error:', err);
        if (!isLoadMore) {
          setError('Something went wrong. Please try again.');
          setAnime([]);
        }
      }
    } finally {
      if (generation === generationRef.current) {
        if (isLoadMore) setLoadingMore(false);
        else setLoading(false);
      }
      if (isLoadMore) fetchingRef.current = false;
    }
  }, []);

  // Reload anime whenever the search text, sorting, or filters change.
  // Searches are slightly delayed to avoid making a request after every keystroke.
  useEffect(() => {
    const filters = { season, year, genres };
    const generation = ++generationRef.current;
    modeRef.current = sortBy;
    offsetRef.current = 0;
    setHasMore(false);
    clearTimeout(debounceRef.current);

    const run = () => fetchPage({ query: searchQuery, mode: sortBy, filters, offset: 0, generation, isLoadMore: false });

    if (searchQuery) {
      debounceRef.current = setTimeout(run, 350);
    } else {
      run();
    }
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, sortBy, season, year, genres, fetchPage]);

  // Fetch the next page, appending to the existing list.
  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore || fetchingRef.current) return;
    const filters = { season, year, genres };
    fetchPage({
      query: searchQuery,
      mode: modeRef.current,
      filters,
      offset: offsetRef.current,
      generation: generationRef.current,
      isLoadMore: true,
    });
  }, [loading, loadingMore, hasMore, searchQuery, season, year, genres, fetchPage]);

  // Keep a ref to the latest loadMore so the IntersectionObserver (created only when
  // the sentinel DOM node itself changes) always calls the current version.
  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  // Observe a sentinel element near the bottom of the grid; scrolling it into view
  // triggers the next page. A callback ref (rather than a plain useEffect) ties the
  // observer's lifetime directly to the sentinel DOM node's own mount/unmount, so it's
  // always disconnected before observing a new node and on unmount.
  const observerRef = useRef(null);
  const sentinelCallbackRef = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (node) {
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) loadMoreRef.current();
      }, { rootMargin: '400px' });
      observerRef.current.observe(node);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, []);

  const emptyMsg = searchQuery
    ? `No results for "${searchQuery}"`
    : 'No anime here yet.';

  return (
    <div className="home">
      {/* Controls used to filter the anime list. */}
      <FilterBar
        season={season}
        year={year}
        genres={genres}
        onSeasonChange={setSeason}
        onYearChange={setYear}
        onGenresChange={setGenres}
        onClear={() => { setSeason(null); setYear(null); setGenres([]); }}
      />
      {error && <div className="home__error">{error}</div>}
      {/* Display the filtered anime list. */}
      <AnimeGrid anime={anime} loading={loading} loadingMore={loadingMore} emptyMessage={emptyMsg} />
      {!loading && hasMore && <div ref={sentinelCallbackRef} className="home__sentinel" />}
    </div>
  );
}
