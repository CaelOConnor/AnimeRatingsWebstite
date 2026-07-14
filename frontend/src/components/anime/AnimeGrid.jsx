import AnimeCard from './AnimeCard';
import './AnimeGrid.css';

// Display a placeholder card while anime data is loading.
function SkeletonCard() {
  return (
    <div className="anime-grid__skeleton-card">
      <div className="anime-grid__skeleton-image" />
      <div className="anime-grid__skeleton-body">
        <div className="anime-grid__skeleton-line" />
        <div className="anime-grid__skeleton-line anime-grid__skeleton-line--short" />
      </div>
    </div>
  );
}

export default function AnimeGrid({ anime = [], loading = false, emptyMessage = 'No anime found.' }) {
  // While data is loading, display placeholder cards instead of leaving the page blank.
  if (loading) {
    return (
      <div className="anime-grid">
        {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  // Show a message if no anime match the current search or filters.
  if (anime.length === 0) {
    return <div className="anime-grid__empty">{emptyMessage}</div>;
  }

  // Display one AnimeCard component for each anime.
  return (
    <div className="anime-grid">
      {anime.map(a => <AnimeCard key={a.id} anime={a} />)}
    </div>
  );
}