import { useState, useRef, useEffect } from 'react';
import { SEASONS, GENRES } from '../../constants/animeFilters';
import './FilterBar.css';

// Display names for each season shown in the dropdown.
const SEASON_LABELS = {
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
};

// Generate a list of years for the year filter.
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1959 }, (_, i) => CURRENT_YEAR + 1 - i);

export default function FilterBar({
  season, year, genres,
  onSeasonChange, onYearChange, onGenresChange, onClear,
}) {

  // Track whether the genre dropdown is currently open.
  const [genreOpen, setGenreOpen] = useState(false);

  // Reference to the genre menu so it can be closed when the user clicks outside of it.
  const genreRef = useRef(null);

  // Close the genre menu whenever the user clicks anywhere outside of the dropdown.
  useEffect(() => {
    function handleClickOutside(e) {
      if (genreRef.current && !genreRef.current.contains(e.target)) {
        setGenreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Add or remove a genre from the selected filters.
  function toggleGenre(g) {
    if (genres.includes(g)) {
      onGenresChange(genres.filter((x) => x !== g));
    } else {
      onGenresChange([...genres, g]);
    }
  }

  // Determine whether any filters are currently active.
  const hasActiveFilters = Boolean(season) || Boolean(year) || genres.length > 0;

  return (
    <div className="filter-bar">
      {/* Season filter */}
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
      
      {/* Year filter */}
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
      
      {/* Genre filter with support for selecting multiple genres. */}
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
      
      {/* Display the clear button only when at least one filter has been selected. */}
      {hasActiveFilters && (
        <button type="button" className="filter-bar__clear" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}