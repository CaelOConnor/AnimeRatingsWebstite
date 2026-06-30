import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import AnimeGrid from '../components/anime/AnimeGrid';
import FilterBar from '../components/anime/FilterBar';
import './Home.css';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function buildQueryParams({ season, year, genres }) {
  const params = new URLSearchParams();
  if (season) params.set('season', season);
  if (year) params.set('year', year);
  genres.forEach((g) => params.append('genre', g));
  return params;
}

export default function Home() {
  const { searchQuery, sortBy } = useOutletContext();

  const [anime, setAnime]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const [season, setSeason] = useState(null);
  const [year, setYear]     = useState(null);
  const [genres, setGenres] = useState([]);

  const debounceRef = useRef(null);
  const abortRef    = useRef(null);

  const fetchAnime = useCallback(async (query, mode, filters) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = buildQueryParams(filters);

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
      setAnime(Array.isArray(data) ? data : (data.anime ?? data.results ?? []));
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Home fetch error:', err);
        setError('Something went wrong. Please try again.');
        setAnime([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

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
      <AnimeGrid anime={anime} loading={loading} emptyMessage={emptyMsg} />
    </div>
  );
}