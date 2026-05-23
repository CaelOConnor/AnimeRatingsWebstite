import { describe, it, expect, afterEach } from 'vitest';
import { removeFromWatchlist, addToWatchlist, getWatchlistEntry } from '../watchlist.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
const _prefix = 'wl_rem'; 

async function makeUser(suffix = '') {
  const uid = `${Date.now() % 1000000}_${++_seq}`;
  return createUser({
    username: `${_prefix}_${uid}${suffix}`,
    email:    `${_prefix}_${uid}${suffix}@example.com`,
    passwordHash: 'hashed_pw',
  });
}

async function makeAnime(tmdbId = 10280) {
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

  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 10280 AND 10289`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('removeFromWatchlist', () => {
  it('removes the entry so it can no longer be fetched', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'watching' });

    await removeFromWatchlist(user.id, anime.id);

    const fetched = await getWatchlistEntry(user.id, anime.id);
    expect(fetched).toBeNull();
  });

  it('returns the deleted entry row', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'completed' });

    const deleted = await removeFromWatchlist(user.id, anime.id);

    expect(deleted).toMatchObject({
      user_id: user.id,
      anime_id: anime.id,
      status: 'completed',
    });
  });

  it('only removes the targeted entry, not other anime on the same users watchlist', async () => {
    const user = await makeUser();
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);
    await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'watching' });
    await addToWatchlist({ userId: user.id, animeId: animeB.id, status: 'completed' });

    await removeFromWatchlist(user.id, animeA.id);

    const entryB = await getWatchlistEntry(user.id, animeB.id);
    expect(entryB).not.toBeNull();
    expect(entryB.anime_id).toBe(animeB.id);
  });

  it('only removes the targeted entry, not the same anime on another users watchlist', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();
    await addToWatchlist({ userId: userA.id, animeId: anime.id, status: 'watching' });
    await addToWatchlist({ userId: userB.id, animeId: anime.id, status: 'plan_to_watch' });

    await removeFromWatchlist(userA.id, anime.id);

    const entryB = await getWatchlistEntry(userB.id, anime.id);
    expect(entryB).not.toBeNull();
    expect(entryB.user_id).toBe(userB.id);
  });

  it('returns null when the entry does not exist', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const deleted = await removeFromWatchlist(user.id, anime.id);

    expect(deleted).toBeNull();
  });

  it('returns null for an invalid user UUID', async () => {
    const anime = await makeAnime();

    const deleted = await removeFromWatchlist('not-a-uuid', anime.id);

    expect(deleted).toBeNull();
  });

  it('returns null for an invalid anime UUID', async () => {
    const user = await makeUser();

    const deleted = await removeFromWatchlist(user.id, 'not-a-uuid');

    expect(deleted).toBeNull();
  });

  it('calling removeFromWatchlist twice on the same pair returns null the second time', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'watching' });

    await removeFromWatchlist(user.id, anime.id);
    const second = await removeFromWatchlist(user.id, anime.id);

    expect(second).toBeNull();
  });
});