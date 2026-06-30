// Mirrors VALID_SEASONS / VALID_GENRES in backend/routes/anime.js.
// No shared package between frontend/backend, so these are kept in sync
// manually — if the backend list changes, update this file too.

export const SEASONS = ['winter', 'spring', 'summer', 'fall'];

export const GENRES = [
  'Action & Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Kids', 'Music',
  'Mystery', 'News', 'Reality', 'Romance', 'Sci-Fi & Fantasy',
  'Science Fiction', 'Soap', 'Talk', 'Thriller', 'War', 'War & Politics',
  'Western',
];