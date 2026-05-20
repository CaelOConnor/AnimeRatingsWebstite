import { describe, it, expect, afterEach } from 'vitest';
import { getWatchlistByUserId, addToWatchlist } from '../watchlist.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeUser(suffix = '') {
  return createUser({
    username: `wl_byuserid_user${suffix}`,
    email: `wl_byuserid_user${suffix}@example.com`,
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
    posterPath: '/poster.jpg',
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
  await query(`DELETE FROM users WHERE email LIKE 'wl_byuserid_user%@example.com'`);
  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 99990 AND 99999`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getWatchlistByUserId', () => {
  it('returns an empty array when the user has no watchlist entries', async () => {
    const user = await makeUser();

    const entries = await getWatchlistByUserId(user.id);

    expect(entries).toEqual([]);
  });

  it('returns a single entry when the user has one anime on their watchlist', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'watching' });

    const entries = await getWatchlistByUserId(user.id);

    expect(entries).toHaveLength(1);
  });

  it('returns all entries when the user has multiple anime on their watchlist', async () => {
    const user = await makeUser();
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);
    const animeC = await makeAnime(99992);

    await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });
    await addToWatchlist({ userId: user.id, animeId: animeB.id, status: 'completed' });
    await addToWatchlist({ userId: user.id, animeId: animeC.id, status: 'plan_to_watch' });

    const entries = await getWatchlistByUserId(user.id);

    expect(entries).toHaveLength(3);
  });

  it('returns the correct watchlist fields on each entry', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'dropped' });

    const entries = await getWatchlistByUserId(user.id);
    const entry = entries[0];

    expect(entry).toMatchObject({
      user_id: user.id,
      anime_id: anime.id,
      status: 'dropped',
      episodes_watched: 0,
    });
    expect(entry.id).toBeDefined();
    expect(entry.updated_at).toBeDefined();
  });

  it('joins and returns the anime title from the anime table', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'watching' });

    const entries = await getWatchlistByUserId(user.id);

    expect(entries[0].title).toBe(anime.title);
  });

  it('joins and returns the anime poster_path from the anime table', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'watching' });

    const entries = await getWatchlistByUserId(user.id);

    expect(entries[0].poster_path).toBe(anime.poster_path);
  });

  it('only returns entries belonging to the requested user, not others', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);

    await addToWatchlist({ userId: userA.id, animeId: animeA.id, status: 'watching' });
    await addToWatchlist({ userId: userB.id, animeId: animeB.id, status: 'completed' });

    const entries = await getWatchlistByUserId(userA.id);

    expect(entries).toHaveLength(1);
    expect(entries[0].user_id).toBe(userA.id);
  });

  it('returns an empty array for a valid UUID that does not exist', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const entries = await getWatchlistByUserId(nonExistentId);

    expect(entries).toEqual([]);
  });

  it('does not return password_hash on any entry', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'watching' });

    const entries = await getWatchlistByUserId(user.id);

    expect(entries[0].password_hash).toBeUndefined();
  });

  it('returns entries with each valid status correctly', async () => {
    const user = await makeUser();
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);
    const animeC = await makeAnime(99992);
    const animeD = await makeAnime(99993);

    await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });
    await addToWatchlist({ userId: user.id, animeId: animeB.id, status: 'completed' });
    await addToWatchlist({ userId: user.id, animeId: animeC.id, status: 'plan_to_watch' });
    await addToWatchlist({ userId: user.id, animeId: animeD.id, status: 'dropped' });

    const entries = await getWatchlistByUserId(user.id);
    const statuses = entries.map((e) => e.status);

    expect(statuses).toContain('watching');
    expect(statuses).toContain('completed');
    expect(statuses).toContain('plan_to_watch');
    expect(statuses).toContain('dropped');
  });
});