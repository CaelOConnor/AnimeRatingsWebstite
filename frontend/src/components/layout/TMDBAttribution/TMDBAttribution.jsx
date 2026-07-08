export default function TMDBAttribution() {
  return (
    <div className="tmdb-attribution">
      <img
        src="/tmdb-logo.svg"
        alt="TMDB"
        className="tmdb-attribution__logo"
      />
      <p className="tmdb-attribution__text">
        This product uses the TMDB API but is not endorsed or certified by
        TMDB — thank you, TMDB, for making this site possible!
      </p>
    </div>
  );
}