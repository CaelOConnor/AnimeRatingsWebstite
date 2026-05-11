-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username        VARCHAR(30)  NOT NULL UNIQUE,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   TEXT         NOT NULL,
  avatar_url      TEXT,
  bio             TEXT,
  is_banned       BOOLEAN DEFAULT FALSE,
  role_type       TEXT DEFAULT 'user',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email    ON users (email);
CREATE INDEX idx_users_username ON users (username);

-- ── Anime cache ───────────────────────────────────────────────────────────────
CREATE TABLE anime (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tmdb_id           INTEGER      NOT NULL,
  tmdb_type         VARCHAR(10)  NOT NULL DEFAULT 'tv',
  season_number     INTEGER      DEFAULT NULL,
  title             VARCHAR(255) NOT NULL,
  original_title    VARCHAR(255),
  overview          TEXT,
  poster_path       TEXT,
  backdrop_path     TEXT,
  episode_count     INTEGER,
  season_count      INTEGER,
  status            VARCHAR(50),
  first_air_date    DATE,
  genres            TEXT[]       NOT NULL DEFAULT '{}',
  cached_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_anime_tmdb_unique ON anime (tmdb_id, tmdb_type, season_number);
CREATE INDEX idx_anime_cached_at ON anime (cached_at);

-- ── Watchlist ─────────────────────────────────────────────────────────────────
CREATE TYPE watchlist_status AS ENUM (
  'watching',
  'completed',
  'plan_to_watch',
  'dropped'
);

CREATE TABLE watchlist (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID            NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  anime_id         UUID            NOT NULL REFERENCES anime(id)  ON DELETE CASCADE,
  status           watchlist_status NOT NULL DEFAULT 'plan_to_watch',
  episodes_watched INTEGER         NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, anime_id)
);

CREATE INDEX idx_watchlist_user  ON watchlist (user_id);
CREATE INDEX idx_watchlist_anime ON watchlist (anime_id);

-- ── Reviews ───────────────────────────────────────────────────────────────────
CREATE TABLE reviews (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID         NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  anime_id          UUID         NOT NULL REFERENCES anime(id)  ON DELETE CASCADE,
  rating            SMALLINT     NOT NULL CHECK (rating BETWEEN 1 AND 10),
  title             VARCHAR(200),
  body              TEXT         NOT NULL,
  contains_spoilers BOOLEAN      NOT NULL DEFAULT FALSE,
  helpful_count     INTEGER      NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, anime_id)
);

CREATE INDEX idx_reviews_anime   ON reviews (anime_id);
CREATE INDEX idx_reviews_user    ON reviews (user_id);
CREATE INDEX idx_reviews_rating  ON reviews (rating);

-- ── Comments ──────────────────────────────────────────────────────────────────
CREATE TABLE comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  review_id  UUID        NOT NULL REFERENCES reviews(id)  ON DELETE CASCADE,
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_review ON comments (review_id);
CREATE INDEX idx_comments_user   ON comments (user_id);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_watchlist_updated_at
  BEFORE UPDATE ON watchlist
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();