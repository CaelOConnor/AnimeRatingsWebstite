import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { query } from './db/db.js';
import authRoutes from './routes/auth.js';
import reviewRoutes from './routes/reviews.js';
import commentRoutes from './routes/comments.js';
import watchlistRoutes from './routes/watchlist.js';
import animeRoutes from './routes/anime.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import reportRoutes from './routes/reports.js';
import feedbackRoutes from './routes/feedback.js';

// Fail loudly at startup rather than silently serving CORS for the dev
// origin in production — a missing CORS_ORIGIN there should surface as an
// immediate, obvious crash, not as "the frontend mysteriously can't reach
// the API" days later.
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  throw new Error(
    'CORS_ORIGIN must be set when NODE_ENV=production — refusing to fall back to the localhost dev origin.'
  );
}

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

// Security response headers (CSP, X-Content-Type-Options, X-Frame-Options,
// etc). HSTS is skipped outside production — this API isn't served over
// HTTPS in dev, and sending Strict-Transport-Security over plain HTTP would
// tell browsers to force HTTPS on a host that doesn't terminate it.
//
// Default CSP is left as-is: this app only ever returns JSON, never HTML, so
// directives like img-src/default-src have no page here to apply to. The
// frontend is a separate Vite app — if it ever needs to allow image.tmdb.org
// for TMDB posters under a CSP, that policy belongs on the frontend's own
// (nginx-served) response headers, not this API's.
app.use(helmet(
  process.env.NODE_ENV === 'production' ? {} : { hsts: false }
));

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use('/uploads', express.static('/app/uploads'));

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/anime', animeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/feedback', feedbackRoutes);

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from backend!' });
});

// Health check — confirms DB is reachable
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: err.message });
  }
});

// Not dead code: multer's fileFilter rejections and file-size-limit errors
// (see upload.single('avatar') in routes/users.js) call next(err)
// internally, which skips straight to this handler since no route wraps
// that middleware in its own try/catch. Anything else reaching here today
// would be a route that started throwing/rejecting without its own
// try/catch — leaking err.message (which can include raw SQL error text or
// file paths) is only safe for local debugging, never in production.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message, err.stack);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({ error: isProd ? 'Internal server error' : err.message });
});

export default app;