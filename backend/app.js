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

// Trust exactly one hop (the nginx reverse proxy in front of this service —
// see nginx/nginx.prod.conf, which sets X-Forwarded-For/X-Real-IP). Without
// this, req.ip resolves to nginx's own container IP in prod, not the real
// client — silently breaking both the rate limiter's per-IP buckets (every
// user would share one) and the IP field in security logging below. Safe
// in dev too: with no proxy in front, there's no X-Forwarded-For to trust,
// so req.ip just falls back to the direct connection as before.
app.set('trust proxy', 1);

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
// 100kb is express.json()'s own default — made explicit here so the limit
// is visible in code rather than relying on an implicit library default.
// Confirmed live: a body over this returns 413 (see the error handler
// below for why it used to show as a 500 instead).
app.use(express.json({ limit: '100kb' }));
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
//
// Respects err.status/err.statusCode when the error already specifies a
// client-error code — body-parser's malformed-JSON error (400) and
// payload-too-large error (413) both set one of these, and forcing every
// error to 500 was flattening those into a misleading "server fault" for
// what's actually bad client input. Confirmed live: a malformed JSON body
// used to come back as 500, now correctly 400; an oversized body used to
// be 500, now correctly 413. Falls back to 500 for anything that doesn't
// specify its own status (genuine unexpected errors).
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message, err.stack);
  const isProd = process.env.NODE_ENV === 'production';
  const status = (typeof err.status === 'number' && err.status >= 400 && err.status < 600)
    ? err.status
    : (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600)
      ? err.statusCode
      : 500;
  const genericMessage = status >= 500 ? 'Internal server error' : 'Bad request';
  res.status(status).json({ error: isProd ? genericMessage : err.message });
});

export default app;