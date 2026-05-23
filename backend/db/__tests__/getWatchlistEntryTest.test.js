import { describe, it, expect, afterEach } from 'vitest';
import { getWatchlistEntry, addToWatchlist } from '../watchlist.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
const _prefix = 'wl_ent'; 

async function makeUser(suffix = '') {
  const uid = `${Date.now() % 1000000}_${++_seq}`;
  return createUser({
    username: `${_prefix}_${uid}${suffix}`,
    email:    `${_prefix}_${uid}${suffix}@example.com`,
    passwordHash: 'hashed_pw',
  });
}

async function makeAnime(tmdbId = 10270) {
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
  await query(`DELETE FROM users WHERE email LIKE '${_prefix}_%@example.com'`);

  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 10270 AND 10279`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getWatchlistEntry', () => {
  it('returns the entry when it exists for the given user and anime', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'watching' });

    const entry = await getWatchlistEntry(user.id, anime.id);

    expect(entry).toMatchObject({
      user_id: user.id,
      anime_id: anime.id,
      status: 'watching',
    });
  });

  it('returns all expected fields', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'completed' });

    const entry = await getWatchlistEntry(user.id, anime.id);

    expect(entry.id).toBeDefined();
    expect(entry.user_id).toBeDefined();
    expect(entry.anime_id).toBeDefined();
    expect(entry.status).toBeDefined();
    expect(entry.episodes_watched).toBeDefined();
    expect(entry.updated_at).toBeDefined();
  });

  it('returns null when the user has not added that anime to their watchlist', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const entry = await getWatchlistEntry(user.id, anime.id);

    expect(entry).toBeNull();
  });

  it('returns null when the user does not exist', async () => {
    const anime = await makeAnime();
    const nonExistentUserId = '00000000-0000-4000-8000-000000000000';

    const entry = await getWatchlistEntry(nonExistentUserId, anime.id);

    expect(entry).toBeNull();
  });

  it('returns null when the anime does not exist', async () => {
    const user = await makeUser();
    const nonExistentAnimeId = '00000000-0000-4000-8000-000000000000';

    const entry = await getWatchlistEntry(user.id, nonExistentAnimeId);

    expect(entry).toBeNull();
  });

  it('returns null for an invalid user UUID', async () => {
    const anime = await makeAnime();

    const entry = await getWatchlistEntry('not-a-uuid', anime.id);

    expect(entry).toBeNull();
  });

  it('returns null for an invalid anime UUID', async () => {
    const user = await makeUser();

    const entry = await getWatchlistEntry(user.id, 'not-a-uuid');

    expect(entry).toBeNull();
  });

  it('returns the correct entry when multiple users have the same anime on their watchlist', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();

    await addToWatchlist({ userId: userA.id, animeId: anime.id, status: 'watching' });
    await addToWatchlist({ userId: userB.id, animeId: anime.id, status: 'completed' });

    const entry = await getWatchlistEntry(userB.id, anime.id);

    expect(entry.user_id).toBe(userB.id);
    expect(entry.status).toBe('completed');
  });

  it('returns the correct entry when the user has multiple anime on their watchlist', async () => {
    const user = await makeUser();
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);

    await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'dropped' });
    await addToWatchlist({ userId: user.id, animeId: animeB.id, status: 'plan_to_watch' });

    const entry = await getWatchlistEntry(user.id, animeB.id);

    expect(entry.anime_id).toBe(animeB.id);
    expect(entry.status).toBe('plan_to_watch');
  });
});