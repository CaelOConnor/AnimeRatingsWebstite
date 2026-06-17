import { Link } from 'react-router-dom';
import './AnimeCard.css';

// Expects anime shape:
// { id, title, cover_image_url, average_rating, genres: ['Action', 'Drama', ...] }

export default function AnimeCard({ anime }) {
  const { id, title, poster_path, average_rating, genres = [] } = anime;
  const cover_image_url = poster_path ? `https://image.tmdb.org/t/p/w500${poster_path}` : null;

  const stars = Math.round(average_rating ?? 0);
  const displayGenres = genres.slice(0, 2);

  return (
    <Link to={`/anime/${id}`} className="anime-card">
      <div className="anime-card__image-wrap">
        {cover_image_url
          ? <img src={cover_image_url} alt={title} className="anime-card__image" loading="lazy" />
          : (
            <div className="anime-card__image-fallback">
              <span className="anime-card__fallback-star">✦</span>
            </div>
          )
        }
        {average_rating != null && (
          <div className="anime-card__rating-badge">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            {Number(average_rating).toFixed(1)}
          </div>
        )}
      </div>

      <div className="anime-card__info">
        <p className="anime-card__title">{title}</p>

        <div className="anime-card__star-row" aria-label={`${stars} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <svg key={n} width="11" height="11" viewBox="0 0 24 24"
              fill={n <= stars ? 'var(--color-accent)' : 'var(--color-border)'}
              aria-hidden="true">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          ))}
        </div>

        {displayGenres.length > 0 && (
          <div className="anime-card__tag-row">
            {displayGenres.map((g) => (
              <span key={g} className="anime-card__tag">{g}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}