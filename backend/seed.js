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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAnime(tmdbId) {
  const res = await fetch(`${BASE_URL}/api/anime/fetch/${tmdbId}`, {
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
  console.log(`Seeding ${ids.length} anime...\n`);

  let added = 0, cached = 0, skipped = 0, failed = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const result = await fetchAnime(id);

    const icon = result.status === 'added'     ? '✓' :
                 result.status === 'cached'    ? '~' :
                 result.status === 'skipped'   ? '⊘' :
                 result.status === 'not_found' ? '?' : '✗';

    console.log(`[${String(i + 1).padStart(3)}/${ids.length}] ${icon} tmdbId=${id} (${result.status}${result.detail ? ': ' + result.detail : ''})`);

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