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

export default function AnimeGrid({ anime = [], loading = false, loadingMore = false, emptyMessage = 'No anime found.' }) {
  // While the initial/reset fetch is loading, replace everything with placeholder
  // cards instead of leaving the page blank (or showing stale results from before
  // a filter/search/sort change).
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

  // Display one AnimeCard component for each anime. While a "load more" request is
  // in flight, append trailing skeleton cards instead of replacing the grid, so
  // the anime already on screen don't disappear while the next batch loads.
  return (
    <div className="anime-grid">
      {anime.map(a => <AnimeCard key={a.id} anime={a} />)}
      {loadingMore && Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={`more-${i}`} />)}
    </div>
  );
}