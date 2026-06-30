import { useState, useRef, useEffect } from 'react';
import { SEASONS, GENRES } from '../../constants/animeFilters';
import './FilterBar.css';

const SEASON_LABELS = {
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
};

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1959 }, (_, i) => CURRENT_YEAR + 1 - i);

export default function FilterBar({
  season, year, genres,
  onSeasonChange, onYearChange, onGenresChange, onClear,
}) {
  const [genreOpen, setGenreOpen] = useState(false);
  const genreRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (genreRef.current && !genreRef.current.contains(e.target)) {
        setGenreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggleGenre(g) {
    if (genres.includes(g)) {
      onGenresChange(genres.filter((x) => x !== g));
    } else {
      onGenresChange([...genres, g]);
    }
  }

  const hasActiveFilters = Boolean(season) || Boolean(year) || genres.length > 0;

  return (
    <div className="filter-bar">
      <select
        className="filter-bar__select"
        value={season ?? ''}
        onChange={(e) => onSeasonChange(e.target.value || null)}
      >
        <option value="">All Seasons</option>
        {SEASONS.map((s) => (
          <option key={s} value={s}>{SEASON_LABELS[s]}</option>
        ))}
      </select>

      <select
        className="filter-bar__select"
        value={year ?? ''}
        onChange={(e) => onYearChange(e.target.value || null)}
      >
        <option value="">All Years</option>
        {YEARS.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      <div className="filter-bar__genre" ref={genreRef}>
        <button
          type="button"
          className="filter-bar__genre-toggle"
          onClick={() => setGenreOpen((o) => !o)}
        >
          Genres{genres.length > 0 ? ` (${genres.length})` : ''}
        </button>

        {genreOpen && (
          <div className="filter-bar__genre-menu">
            {GENRES.map((g) => (
              <label key={g} className="filter-bar__genre-option">
                <input
                  type="checkbox"
                  checked={genres.includes(g)}
                  onChange={() => toggleGenre(g)}
                />
                {g}
              </label>
            ))}
          </div>
        )}
      </div>

      {hasActiveFilters && (
        <button type="button" className="filter-bar__clear" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}