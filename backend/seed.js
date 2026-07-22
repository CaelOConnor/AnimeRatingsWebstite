/**
 * seed.js
 * -------
 * One-time script to seed the database with popular anime from TMDB.
 *
 * Usage:
 *   docker compose exec -e SEED_TOKEN=your_jwt backend node seed.js
 *
 * NOTE (2026-07-16): This list was fully rebuilt after discovering that
 * over half of the originally-cached rows were mislabeled — the ids and
 * comments had drifted out of sync at some point before this list ever
 * reached this project. Every id below was individually re-verified
 * against TMDB's own search results. See conversation history for the
 * full audit if you need to double check any individual entry.
 *
 * Known gap: "Demon Slayer: Mugen Train" is a movie on TMDB, not a TV
 * show, so it isn't included here — this script only fetches tmdbType
 * 'tv' by default. Add movie support to fetchAnime() (pass ?type=movie)
 * if you want to pull it in later.
 */

const BASE_URL = 'http://localhost:3001';
const TOKEN = process.env.SEED_TOKEN;

if (!TOKEN) {
  console.error('Error: SEED_TOKEN environment variable is required.');
  console.error('Usage: docker compose exec -e SEED_TOKEN=your_jwt backend node seed.js');
  process.exit(1);
}

const TV_IDS = [
  1429,   // Attack on Titan
  31911,  // Fullmetal Alchemist: Brotherhood
  13916,  // Death Note
  85937,  // Demon Slayer: Kimetsu no Yaiba
  95479,  // Jujutsu Kaisen
  63926,  // One-Punch Man
  37854,  // One Piece
  30984,  // Bleach
  46260,  // Naruto (was mislabeled "My Hero Academia")
  70881,  // Boruto: Naruto Next Generations (was mislabeled "Tokyo Ghoul")
  46298,  // Hunter x Hunter (2011) (was mislabeled "Haikyuu!!")
  72636,  // Made in Abyss (was mislabeled "The Rising of the Shield Hero")
  65930,  // My Hero Academia (was mislabeled "Re:Zero")
  76121,  // DARLING in the FRANXX (was mislabeled "Overlord")
  46261,  // Fairy Tail (was mislabeled "Hunter x Hunter (2011)")
  12609,  // Dragon Ball (was mislabeled "Code Geass")
  114410, // Chainsaw Man (was mislabeled "Spy x Family")
  84669,  // The Quintessential Quintuplets (was mislabeled "Dr. Stone")
  61374,  // Tokyo Ghoul (was mislabeled "No Game No Life")
  62745,  // Is It Wrong to Try to Pick Up Girls in a Dungeon? (was mislabeled "Charlotte")
  120089, // SPY x FAMILY (was mislabeled "Frieren: Beyond Journey's End")
  209867, // Frieren: Beyond Journey's End (was mislabeled "Delicious in Dungeon")
  82684,  // That Time I Got Reincarnated as a Slime (was mislabeled "Demon Slayer: Mugen Train Arc")
  45782,  // Sword Art Online
  73223,  // Black Clover
  890,    // Neon Genesis Evangelion
  12971,  // Dragon Ball Z
  1095,   // Ghost in the Shell: Stand Alone Complex
  30991,  // Cowboy Bebop
  37863,  // Fullmetal Alchemist (2003)
  88803,  // Vinland Saga
  94664,  // Mushoku Tensei: Jobless Reincarnation
  131041, // Blue Lock
  203737, // Oshi no Ko
  88046,  // Fire Force
  83097,  // The Promised Neverland
  65844,  // KONOSUBA - God's Blessing on This Wonderful World!
  60728,  // Kill la Kill
  61663,  // Your Lie in April
  62110,  // Assassination Classroom
  64710,  // Noragami
  45783,  // Kuroko's Basketball
  62273,  // Food Wars! Shokugeki no Soma
  42509,  // Steins;Gate
  78102,  // Steins;Gate 0
  61459,  // Parasyte -the maxim-
  67395,  // Tokyo Ravens
  62450,  // Plastic Memories
  83121,  // Kaguya-sama: Love Is War
  119100, // BOCCHI THE ROCK!
  204832, // MASHLE: MAGIC AND MUSCLES
  209077, // Undead Unluck
  127532, // Solo Leveling
  65931,  // Bungo Stray Dogs
  67075,  // Mob Psycho 100
  65676,  // My Teen Romantic Comedy SNAFU
  61223,  // Akame ga Kill!
  100565, // 86 EIGHTY-SIX
  112613, // Ranking of Kings
  123876, // Komi Can't Communicate
  83095,  // The Rising of the Shield Hero
  217766, // Zom 100: Bucket List of the Dead
  42916,  // Toradora!
  85991,  // Fruits Basket (2019)
  65249,  // Erased
  43865,  // Psycho-Pass
  42671,  // Elfen Lied
  60863,  // Haikyuu!!
  60808,  // No Game No Life
  63145,  // Charlotte
  64196,  // Overlord
  86031,  // Dr. STONE
  207784, // Delicious in Dungeon
  31724,  // Code Geass: Lelouch of the Rebellion
  65942,  // Re:ZERO -Starting Life in Another World-
];

// Shows that span multiple TMDB seasons, where a specific season (beyond
// the whole-series row above) should also be cached as its own row.
// NOTE: Frieren (tmdb_id 209867) is NOT here — re-verified live against
// TMDB's /tv/209867 endpoint: number_of_seasons is genuinely 1. Its
// `seasons` array lists a "Specials" entry (season 0), but TMDB doesn't
// count specials toward number_of_seasons, so Frieren is a single-season
// show and should only ever have the one whole-series row.
//
// Full audit of every TV_IDS entry completed — every show below with 2+
// real seasons (specials/season 0 excluded, same rule as Frieren) is fully
// represented. Two intentional exclusions found during the audit:
//   - BOCCHI THE ROCK! season 2 and The Rising of the Shield Hero season 5
//     are TMDB stubs (0 episodes, no air date) — not aired yet, so skipped
//     until TMDB has real data for them.
//   - One Piece's 23 TMDB "seasons" are really story arcs, not broadcast
//     seasons (13-197 episodes each, most with no air date) — included
//     anyway per explicit confirmation, but flagged here since it's a very
//     different shape from every other entry in this list.
const SEASON_ENTRIES = [
  { id: 1429,   season: 1 }, // Attack on Titan — Season 1
  { id: 1429,   season: 2 }, // Attack on Titan — Season 2
  { id: 1429,   season: 3 }, // Attack on Titan — Season 3
  { id: 1429,   season: 4 }, // Attack on Titan — The Final Season

  { id: 85937,  season: 1 }, // Demon Slayer — Unwavering Resolve Arc
  { id: 85937,  season: 2 }, // Demon Slayer — Mugen Train Arc
  { id: 85937,  season: 3 }, // Demon Slayer — Entertainment District Arc
  { id: 85937,  season: 4 }, // Demon Slayer — Swordsmith Village Arc
  { id: 85937,  season: 5 }, // Demon Slayer — Hashira Training Arc

  { id: 63926,  season: 1 }, // One-Punch Man — Season 1
  { id: 63926,  season: 2 }, // One-Punch Man — Season 2
  { id: 63926,  season: 3 }, // One-Punch Man — Season 3

  // One Piece — TMDB's 23 "seasons" are story arcs, not broadcast seasons;
  // included per explicit confirmation despite the very different shape
  // (huge episode counts, most arcs have no TMDB air date).
  { id: 37854,  season: 1 },  // East Blue
  { id: 37854,  season: 2 },  // Whiskey Peak & Little Garden
  { id: 37854,  season: 3 },  // Drum Island
  { id: 37854,  season: 4 },  // Alabasta
  { id: 37854,  season: 5 },  // Dreams!, The Zenny Pirate Crew Sortie!, Beyond the Rainbow
  { id: 37854,  season: 6 },  // Skypiea
  { id: 37854,  season: 7 },  // G-8 & Long Ring Long Land
  { id: 37854,  season: 8 },  // Water Seven
  { id: 37854,  season: 9 },  // Enies Lobby
  { id: 37854,  season: 10 }, // Thriller Bark
  { id: 37854,  season: 11 }, // Sabaody Archipelago
  { id: 37854,  season: 12 }, // Amazon Lily
  { id: 37854,  season: 13 }, // Impel Down & Marineford
  { id: 37854,  season: 14 }, // Fishman Island
  { id: 37854,  season: 15 }, // Punk Hazard
  { id: 37854,  season: 16 }, // Dressrosa
  { id: 37854,  season: 17 }, // Dressrosa (2)
  { id: 37854,  season: 18 }, // Zou
  { id: 37854,  season: 19 }, // Whole Cake Island
  { id: 37854,  season: 20 }, // Levely Arc
  { id: 37854,  season: 21 }, // Wano Country Arc
  { id: 37854,  season: 22 }, // Egghead
  { id: 37854,  season: 23 }, // Elbaph

  { id: 30984,  season: 1 }, // Bleach — Season 1
  { id: 30984,  season: 2 }, // Bleach — Thousand-Year Blood War

  { id: 46260,  season: 1 }, // Naruto — Season 1
  { id: 46260,  season: 2 }, // Naruto — Season 2
  { id: 46260,  season: 3 }, // Naruto — Season 3
  { id: 46260,  season: 4 }, // Naruto — Season 4

  { id: 46298,  season: 1 }, // Hunter x Hunter (2011) — Season 1
  { id: 46298,  season: 2 }, // Hunter x Hunter (2011) — Season 2
  { id: 46298,  season: 3 }, // Hunter x Hunter (2011) — Season 3

  { id: 72636,  season: 1 }, // Made in Abyss — Season 1
  { id: 72636,  season: 2 }, // Made in Abyss — The Golden City of the Scorching Sun

  { id: 65930,  season: 1 }, // My Hero Academia — Season 1
  { id: 65930,  season: 2 }, // My Hero Academia — Season 2
  { id: 65930,  season: 3 }, // My Hero Academia — Season 3
  { id: 65930,  season: 4 }, // My Hero Academia — Season 4
  { id: 65930,  season: 5 }, // My Hero Academia — Season 5
  { id: 65930,  season: 6 }, // My Hero Academia — Season 6
  { id: 65930,  season: 7 }, // My Hero Academia — Season 7
  { id: 65930,  season: 8 }, // My Hero Academia — FINAL SEASON

  { id: 46261,  season: 1 }, // Fairy Tail — Season 1
  { id: 46261,  season: 2 }, // Fairy Tail — Season 2
  { id: 46261,  season: 3 }, // Fairy Tail — Season 3
  { id: 46261,  season: 4 }, // Fairy Tail — Season 4
  { id: 46261,  season: 5 }, // Fairy Tail — Season 5
  { id: 46261,  season: 6 }, // Fairy Tail — Season 6
  { id: 46261,  season: 7 }, // Fairy Tail — FAIRY TAIL ZERØ
  { id: 46261,  season: 8 }, // Fairy Tail — Final Series

  { id: 84669,  season: 1 }, // The Quintessential Quintuplets — Season 1
  { id: 84669,  season: 2 }, // The Quintessential Quintuplets — Season 2

  { id: 61374,  season: 1 }, // Tokyo Ghoul — Season 1
  { id: 61374,  season: 2 }, // Tokyo Ghoul — √A
  { id: 61374,  season: 3 }, // Tokyo Ghoul — :re
  { id: 61374,  season: 4 }, // Tokyo Ghoul — :re 2nd Season

  { id: 62745,  season: 1 }, // Is It Wrong to Try to Pick Up Girls in a Dungeon? — Season 1
  { id: 62745,  season: 2 }, // Is It Wrong to Try to Pick Up Girls in a Dungeon? — Season 2
  { id: 62745,  season: 3 }, // Is It Wrong to Try to Pick Up Girls in a Dungeon? — Season 3
  { id: 62745,  season: 4 }, // Is It Wrong to Try to Pick Up Girls in a Dungeon? — Season 4
  { id: 62745,  season: 5 }, // Is It Wrong to Try to Pick Up Girls in a Dungeon? — Season 5

  { id: 120089, season: 1 }, // SPY x FAMILY — Season 1
  { id: 120089, season: 2 }, // SPY x FAMILY — Season 2
  { id: 120089, season: 3 }, // SPY x FAMILY — Season 3

  { id: 82684,  season: 1 }, // That Time I Got Reincarnated as a Slime — Season 1
  { id: 82684,  season: 2 }, // That Time I Got Reincarnated as a Slime — Season 2
  { id: 82684,  season: 3 }, // That Time I Got Reincarnated as a Slime — Season 3
  { id: 82684,  season: 4 }, // That Time I Got Reincarnated as a Slime — Season 4

  { id: 45782,  season: 1 }, // Sword Art Online — Season 1
  { id: 45782,  season: 2 }, // Sword Art Online — II
  { id: 45782,  season: 3 }, // Sword Art Online — Alicization
  { id: 45782,  season: 4 }, // Sword Art Online — Alicization: War of Underworld

  { id: 12971,  season: 1 }, // Dragon Ball Z — Saiyan Saga
  { id: 12971,  season: 2 }, // Dragon Ball Z — Namek Saga
  { id: 12971,  season: 3 }, // Dragon Ball Z — Frieza Saga
  { id: 12971,  season: 4 }, // Dragon Ball Z — Androids Saga
  { id: 12971,  season: 5 }, // Dragon Ball Z — Cell Saga
  { id: 12971,  season: 6 }, // Dragon Ball Z — Cell Games Saga
  { id: 12971,  season: 7 }, // Dragon Ball Z — World Tournament Saga
  { id: 12971,  season: 8 }, // Dragon Ball Z — Majin Buu Saga
  { id: 12971,  season: 9 }, // Dragon Ball Z — Kid Buu Saga

  { id: 1095,   season: 1 }, // Ghost in the Shell: Stand Alone Complex — Season 1
  { id: 1095,   season: 2 }, // Ghost in the Shell: Stand Alone Complex — 2nd GIG

  { id: 88803,  season: 1 }, // Vinland Saga — Season 1
  { id: 88803,  season: 2 }, // Vinland Saga — Season 2

  { id: 94664,  season: 1 }, // Mushoku Tensei: Jobless Reincarnation — Season 1
  { id: 94664,  season: 2 }, // Mushoku Tensei: Jobless Reincarnation — Season 2
  { id: 94664,  season: 3 }, // Mushoku Tensei: Jobless Reincarnation — Season 3

  { id: 88046,  season: 1 }, // Fire Force — Season 1
  { id: 88046,  season: 2 }, // Fire Force — Season 2
  { id: 88046,  season: 3 }, // Fire Force — Season 3

  { id: 83097,  season: 1 }, // The Promised Neverland — Season 1
  { id: 83097,  season: 2 }, // The Promised Neverland — Season 2

  { id: 65844,  season: 1 }, // KONOSUBA — Season 1
  { id: 65844,  season: 2 }, // KONOSUBA — Season 2
  { id: 65844,  season: 3 }, // KONOSUBA — Season 3

  { id: 62110,  season: 1 }, // Assassination Classroom — Season 1
  { id: 62110,  season: 2 }, // Assassination Classroom — Season 2

  { id: 64710,  season: 1 }, // Noragami — Season 1
  { id: 64710,  season: 2 }, // Noragami — Aragoto

  { id: 45783,  season: 1 }, // Kuroko's Basketball — Season 1
  { id: 45783,  season: 2 }, // Kuroko's Basketball — Season 2
  { id: 45783,  season: 3 }, // Kuroko's Basketball — Season 3

  { id: 62273,  season: 1 }, // Food Wars! Shokugeki no Soma — Season 1
  { id: 62273,  season: 2 }, // Food Wars! Shokugeki no Soma — The Second Plate
  { id: 62273,  season: 3 }, // Food Wars! Shokugeki no Soma — The Third Plate
  { id: 62273,  season: 4 }, // Food Wars! Shokugeki no Soma — The Fourth Plate
  { id: 62273,  season: 5 }, // Food Wars! Shokugeki no Soma — The Fifth Plate

  { id: 83121,  season: 1 }, // Kaguya-sama: Love Is War — Season 1
  { id: 83121,  season: 2 }, // Kaguya-sama: Love Is War — Love Is War?
  { id: 83121,  season: 3 }, // Kaguya-sama: Love Is War — Ultra Romantic

  // BOCCHI THE ROCK! season 2 is a TMDB stub (0 episodes, no air date) —
  // skipped until it's actually aired.
  { id: 119100, season: 1 }, // BOCCHI THE ROCK! — Season 1

  { id: 67075,  season: 1 }, // Mob Psycho 100 — Season 1
  { id: 67075,  season: 2 }, // Mob Psycho 100 — Season 2
  { id: 67075,  season: 3 }, // Mob Psycho 100 — Season 3

  { id: 65676,  season: 1 }, // My Teen Romantic Comedy SNAFU — Season 1
  { id: 65676,  season: 2 }, // My Teen Romantic Comedy SNAFU — TOO!
  { id: 65676,  season: 3 }, // My Teen Romantic Comedy SNAFU — Climax!

  // The Rising of the Shield Hero season 5 is a TMDB stub (0 episodes, no
  // air date) — skipped until it's actually aired.
  { id: 83095,  season: 1 }, // The Rising of the Shield Hero — Season 1
  { id: 83095,  season: 2 }, // The Rising of the Shield Hero — Season 2
  { id: 83095,  season: 3 }, // The Rising of the Shield Hero — Season 3
  { id: 83095,  season: 4 }, // The Rising of the Shield Hero — Season 4

  { id: 85991,  season: 1 }, // Fruits Basket (2019) — Season 1
  { id: 85991,  season: 2 }, // Fruits Basket (2019) — Season 2
  { id: 85991,  season: 3 }, // Fruits Basket (2019) — The Final Season

  { id: 43865,  season: 1 }, // Psycho-Pass — Season 1
  { id: 43865,  season: 2 }, // Psycho-Pass — Season 2
  { id: 43865,  season: 3 }, // Psycho-Pass — Season 3

  { id: 60863,  season: 1 }, // Haikyuu!! — Season 1
  { id: 60863,  season: 2 }, // Haikyuu!! — Season 2
  { id: 60863,  season: 3 }, // Haikyuu!! — Karasuno High School vs Shiratorizawa Academy
  { id: 60863,  season: 4 }, // Haikyuu!! — TO THE TOP

  { id: 64196,  season: 1 }, // Overlord — Season 1
  { id: 64196,  season: 2 }, // Overlord — II
  { id: 64196,  season: 3 }, // Overlord — III
  { id: 64196,  season: 4 }, // Overlord — IV

  { id: 86031,  season: 1 }, // Dr. STONE — Season 1
  { id: 86031,  season: 2 }, // Dr. STONE — Stone Wars
  { id: 86031,  season: 3 }, // Dr. STONE — New World
  { id: 86031,  season: 4 }, // Dr. STONE — Science Future

  { id: 207784, season: 1 }, // Delicious in Dungeon — Season 1
  { id: 207784, season: 2 }, // Delicious in Dungeon — Season 2

  { id: 31724,  season: 1 }, // Code Geass: Lelouch of the Rebellion — R1
  { id: 31724,  season: 2 }, // Code Geass: Lelouch of the Rebellion — R2
];

// Anime movies — verified individually against TMDB's search + keywords
// endpoints before being hardcoded (same rule as TV_IDS/SEASON_ENTRIES).
const MOVIE_IDS = [
  129,    // Spirited Away
  372058, // Your Name.
  128,    // Princess Mononoke
];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAnime(tmdbId, { season, type } = {}) {
  const params = new URLSearchParams();
  if (season !== undefined) params.set('season', season);
  if (type !== undefined) params.set('type', type);
  const qs = params.toString();
  const url = `${BASE_URL}/api/anime/fetch/${tmdbId}${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  if (res.status === 201) return { status: 'added' };
  if (res.status === 200) return { status: 'cached' };
  if (res.status === 404) return { status: 'not_found' };
  if (res.status === 422) {
    const body = await res.json().catch(() => ({}));
    return { status: 'skipped', detail: body.error };
  }

  const body = await res.json().catch(() => ({}));
  return { status: 'error', detail: body.error ?? res.status };
}

async function main() {
  const ids = [...new Set(TV_IDS)];
  const movieIds = [...new Set(MOVIE_IDS)];
  const entries = [
    ...ids.map(id => ({ id })),
    ...SEASON_ENTRIES,
    ...movieIds.map(id => ({ id, type: 'movie' })),
  ];
  console.log(`Seeding ${ids.length} anime (+ ${SEASON_ENTRIES.length} season-specific entries, + ${movieIds.length} movies)...\n`);

  let added = 0, cached = 0, skipped = 0, failed = 0;

  for (let i = 0; i < entries.length; i++) {
    const { id, season, type } = entries[i];
    const result = await fetchAnime(id, { season, type });

    const icon = result.status === 'added'     ? '✓' :
                 result.status === 'cached'    ? '~' :
                 result.status === 'skipped'   ? '⊘' :
                 result.status === 'not_found' ? '?' : '✗';

    const label = [
      `tmdbId=${id}`,
      season !== undefined ? `season=${season}` : null,
      type !== undefined ? `type=${type}` : null,
    ].filter(Boolean).join(' ');
    console.log(`[${String(i + 1).padStart(3)}/${entries.length}] ${icon} ${label} (${result.status}${result.detail ? ': ' + result.detail : ''})`);

    if (result.status === 'added')   added++;
    if (result.status === 'cached')  cached++;
    if (result.status === 'skipped') skipped++;
    if (result.status === 'error' || result.status === 'not_found') failed++;

    await delay(300);
  }

  console.log(`\nDone. Added: ${added} | Already cached: ${cached} | Skipped (not anime/adult): ${skipped} | Failed: ${failed}`);
}

main().catch(err => {
  console.error('Seed script error:', err);
  process.exit(1);
});