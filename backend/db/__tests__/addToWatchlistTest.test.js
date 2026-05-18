import { describe, it, expect, afterEach } from 'vitest';
import { addToWatchlist } from '../watchlist.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeUser(suffix = '') {
  return createUser({
    username: `wl_add_user${suffix}`,
    email: `wl_add_user${suffix}@example.com`,
    passwordHash: 'hashed_pw',
  });
}

async function makeAnime(tmdbId = 99990) {
  return upsertAnime({
    tmdbId,
    tmdbType: 'tv',
    seasonNumber: null,
    title: `Test Anime ${tmdbId}`,
    originalTitle: null,
    overview: 'A test anime.',
    posterPath: null,
    backdropPath: null,
    episodeCount: null,
    seasonCount: null,
    status: 'Ended',
    firstAirDate: '2020-01-01',
    genres: [],
  });
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(async () => {
  await query(`
    DELETE FROM watchlist
    WHERE anime_id IN (
      SELECT id FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999
    )
  `);
  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999`);
  await query(`DELETE FROM users WHERE email LIKE 'wl_add_user%@example.com'`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('addToWatchlist', () => {
  it('inserts a watchlist entry and returns the expected fields', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const entry = await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'watching' });

    expect(entry).toMatchObject({
      user_id: user.id,
      anime_id: anime.id,
      status: 'watching',
    });
  });

  it('returns an id (UUID) on the created entry', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const entry = await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'plan_to_watch' });

    expect(entry.id).toBeDefined();
    expect(typeof entry.id).toBe('string');
    expect(entry.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('returns updated_at timestamp', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const entry = await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'watching' });

    expect(entry.updated_at).toBeDefined();
  });

  it('defaults episodes_watched to 0', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const entry = await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'watching' });

    expect(entry.episodes_watched).toBe(0);
  });

  it('accepts all valid status values', async () => {
    const statuses = ['watching', 'completed', 'plan_to_watch', 'dropped'];
    const user = await makeUser();

    for (let i = 0; i < statuses.length; i++) {
      const anime = await makeAnime(99990 + i);
      const entry = await addToWatchlist({ userId: user.id, animeId: anime.id, status: statuses[i] });
      expect(entry.status).toBe(statuses[i]);
    }
  });

  it('throws a friendly error when the same user adds the same anime twice', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'plan_to_watch' });

    await expect(
      addToWatchlist({ userId: user.id, animeId: anime.id, status: 'watching' })
    ).rejects.toThrow(/already in your watchlist/i);
  });

  it('allows two different users to add the same anime to their watchlists', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();

    const entryA = await addToWatchlist({ userId: userA.id, animeId: anime.id, status: 'watching' });
    const entryB = await addToWatchlist({ userId: userB.id, animeId: anime.id, status: 'completed' });

    expect(entryA.user_id).toBe(userA.id);
    expect(entryB.user_id).toBe(userB.id);
  });

  it('allows the same user to add different anime to their watchlist', async () => {
    const user = await makeUser();
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);

    const entryA = await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });
    const entryB = await addToWatchlist({ userId: user.id, animeId: animeB.id, status: 'plan_to_watch' });

    expect(entryA.anime_id).toBe(animeA.id);
    expect(entryB.anime_id).toBe(animeB.id);
  });

  it('throws when an invalid status value is provided', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await expect(
      addToWatchlist({ userId: user.id, animeId: anime.id, status: 'invalid_status' })
    ).rejects.toThrow();
  });

  it('throws a friendly error when the user does not exist', async () => {
    const anime = await makeAnime();
    const nonExistentUserId = '00000000-0000-4000-8000-000000000000';

    await expect(
      addToWatchlist({ userId: nonExistentUserId, animeId: anime.id, status: 'watching' })
    ).rejects.toThrow(/user/i);
  });

  it('throws a friendly error when the anime does not exist', async () => {
    const user = await makeUser();
    const nonExistentAnimeId = '00000000-0000-4000-8000-000000000000';

    await expect(
      addToWatchlist({ userId: user.id, animeId: nonExistentAnimeId, status: 'watching' })
    ).rejects.toThrow(/anime/i);
  });
});