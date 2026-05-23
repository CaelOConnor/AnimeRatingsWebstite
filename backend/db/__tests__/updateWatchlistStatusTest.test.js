import { describe, it, expect, afterEach } from 'vitest';
import { updateWatchlistStatus, addToWatchlist, getWatchlistEntry } from '../watchlist.js';
import { upsertAnime } from '../anime.js';
import { createUser } from '../users.js';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seq = 0;
const _prefix = 'wl_upd'; 

async function makeUser(suffix = '') {
  const uid = `${Date.now() % 1000000}_${++_seq}`;
  return createUser({
    username:     `${_prefix}_${uid}${suffix}`,
    email:        `${_prefix}_${uid}${suffix}@example.com`,
    passwordHash: 'hashed_pw',
  });
}

async function makeAnime(tmdbId = 10320) {
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
  await query(`DELETE FROM anime WHERE tmdb_id BETWEEN 10320 AND 10329`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('updateWatchlistStatus', () => {
  it('updates the status and returns the updated entry', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'plan_to_watch' });

    const updated = await updateWatchlistStatus(user.id, anime.id, 'watching');

    expect(updated.status).toBe('watching');
  });

  it('returns the full entry row after update', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'watching' });

    const updated = await updateWatchlistStatus(user.id, anime.id, 'completed');

    expect(updated.user_id).toBe(user.id);
    expect(updated.anime_id).toBe(anime.id);
    expect(updated.id).toBeDefined();
    expect(updated.episodes_watched).toBeDefined();
    expect(updated.updated_at).toBeDefined();
  });

  it('accepts all valid status values', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'plan_to_watch' });

    const statuses = ['watching', 'completed', 'dropped', 'plan_to_watch'];

    for (const status of statuses) {
      const updated = await updateWatchlistStatus(user.id, anime.id, status);
      expect(updated.status).toBe(status);
    }
  });

  it('updated_at is refreshed after update', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    const entry = await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'plan_to_watch' });

    await new Promise((res) => setTimeout(res, 50));

    const updated = await updateWatchlistStatus(user.id, anime.id, 'watching');

    expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
      new Date(entry.updated_at).getTime()
    );
  });

  it('persists the status change to the database', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'plan_to_watch' });

    await updateWatchlistStatus(user.id, anime.id, 'completed');

    const fetched = await getWatchlistEntry(user.id, anime.id);
    expect(fetched.status).toBe('completed');
  });

  it('only updates the targeted entry, not others belonging to the same user', async () => {
    const user = await makeUser();
    const animeA = await makeAnime(99990);
    const animeB = await makeAnime(99991);
    await addToWatchlist({ userId: user.id, animeId: animeA.id, status: 'plan_to_watch' });
    await addToWatchlist({ userId: user.id, animeId: animeB.id, status: 'plan_to_watch' });

    await updateWatchlistStatus(user.id, animeA.id, 'watching');

    const entryB = await getWatchlistEntry(user.id, animeB.id);
    expect(entryB.status).toBe('plan_to_watch');
  });

  it('only updates the targeted entry, not the same anime on another users watchlist', async () => {
    const userA = await makeUser('_a');
    const userB = await makeUser('_b');
    const anime = await makeAnime();
    await addToWatchlist({ userId: userA.id, animeId: anime.id, status: 'plan_to_watch' });
    await addToWatchlist({ userId: userB.id, animeId: anime.id, status: 'plan_to_watch' });

    await updateWatchlistStatus(userA.id, anime.id, 'watching');

    const entryB = await getWatchlistEntry(userB.id, anime.id);
    expect(entryB.status).toBe('plan_to_watch');
  });

  it('returns null when the entry does not exist', async () => {
    const user = await makeUser();
    const anime = await makeAnime();

    const updated = await updateWatchlistStatus(user.id, anime.id, 'watching');

    expect(updated).toBeNull();
  });

  it('returns null for an invalid user UUID', async () => {
    const anime = await makeAnime();

    const updated = await updateWatchlistStatus('not-a-uuid', anime.id, 'watching');

    expect(updated).toBeNull();
  });

  it('returns null for an invalid anime UUID', async () => {
    const user = await makeUser();

    const updated = await updateWatchlistStatus(user.id, 'not-a-uuid', 'watching');

    expect(updated).toBeNull();
  });

  it('throws when an invalid status value is provided', async () => {
    const user = await makeUser();
    const anime = await makeAnime();
    await addToWatchlist({ userId: user.id, animeId: anime.id, status: 'watching' });

    await expect(
      updateWatchlistStatus(user.id, anime.id, 'invalid_status')
    ).rejects.toThrow();
  });
});