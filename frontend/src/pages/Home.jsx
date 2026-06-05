import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import AnimeGrid from '../components/anime/AnimeGrid';
import './Home.css';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const SORT_OPTIONS = [
  { value: 'rating',   label: 'Top Rated' },
  { value: 'popular',  label: 'Most Popular' },
  { value: 'recent',   label: 'Recently Added' },
  { value: 'title',    label: 'Title A–Z' },
];

export default function Home() {
  const { searchQuery } = useOutletContext();

  const [anime, setAnime]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort]       = useState('rating');
  const [error, setError]     = useState(null);

  const debounceRef = useRef(null);
  const abortRef    = useRef(null);

  const fetchAnime = useCallback(async (query, sortBy) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const url = query
        ? `${BASE_URL}/api/anime/search?q=${encodeURIComponent(query)}&sort=${sortBy}`
        : `${BASE_URL}/api/anime/browse?sort=${sortBy}`;

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
    clearTimeout(debounceRef.current);
    if (searchQuery) {
      debounceRef.current = setTimeout(() => fetchAnime(searchQuery, sort), 350);
    } else {
      fetchAnime(searchQuery, sort);
    }
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, sort, fetchAnime]);

  const emptyMsg = searchQuery
    ? `No results for "${searchQuery}"`
    : 'No anime here yet.';

  return (
    <div className="home">
      <div className="home__header">
        <h1 className="home__title">
          {searchQuery ? `Results for "${searchQuery}"` : 'Browse Anime'}
        </h1>

        <div className="home__sort">
          <span className="home__sort-label">Sort by</span>
          <select
            className="home__sort-select"
            value={sort}
            onChange={e => setSort(e.target.value)}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="home__error">{error}</div>}

      <AnimeGrid anime={anime} loading={loading} emptyMessage={emptyMsg} />
    </div>
  );
}