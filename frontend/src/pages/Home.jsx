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
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // Store the currently selected filters.
  const [season, setSeason] = useState(null);
  const [year, setYear]     = useState(null);
  const [genres, setGenres] = useState([]);

  // References used to debounce searches and cancel previous API requests when a new search begins.
  const debounceRef = useRef(null);
  const abortRef    = useRef(null);

  // Fetch anime based on the current search, sort option, and selected filters.
  const fetchAnime = useCallback(async (query, mode, filters) => {

    // Cancel any request that is still in progress.
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = buildQueryParams(filters);
      
      // Choose the appropriate API endpoint depending on whether the user is searching or browsing.
      let url;
      if (query) {
        params.set('q', query);
        url = `${BASE_URL}/api/anime/search?${params.toString()}`;
      } else {
        params.set('mode', mode);
        url = `${BASE_URL}/api/anime/browse?${params.toString()}`;
      }

      const res = await fetch(url, { signal: abortRef.current.signal });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();

      // Support multiple possible response formats.
      setAnime(Array.isArray(data) ? data : (data.anime ?? data.results ?? []));
    } catch (err) {
      // Ignore cancelled requests, but display an error for any other failure.
      if (err.name !== 'AbortError') {
        console.error('Home fetch error:', err);
        setError('Something went wrong. Please try again.');
        setAnime([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload anime whenever the search text, sorting, or filters change. 
  // Searches are slightly delayed to avoid making a request after every keystroke.
  useEffect(() => {
    const filters = { season, year, genres };
    clearTimeout(debounceRef.current);
    if (searchQuery) {
      debounceRef.current = setTimeout(() => fetchAnime(searchQuery, sortBy, filters), 350);
    } else {
      fetchAnime('', sortBy, filters);
    }
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, sortBy, season, year, genres, fetchAnime]);

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
      <AnimeGrid anime={anime} loading={loading} emptyMessage={emptyMsg} />
    </div>
  );
}