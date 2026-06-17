/**
 * seed.js
 * -------
 * One-time script to seed the database with popular anime from TMDB.
 *
 * Usage:
 *   docker compose exec -e SEED_TOKEN=your_jwt backend node seed.js
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
  85937,  // Demon Slayer
  95479,  // Jujutsu Kaisen
  63926,  // One Punch Man
  46260,  // My Hero Academia
  37854,  // One Piece
  11757,  // Sword Art Online
  70881,  // Tokyo Ghoul
  30984,  // Bleach
  46298,  // Haikyuu!!
  44217,  // Black Clover
  72636,  // The Rising of the Shield Hero
  65930,  // Re:Zero
  78804,  // That Time I Got Reincarnated as a Slime
  76121,  // Overlord
  40748,  // Fairy Tail
  1530,   // Naruto
  46261,  // Hunter x Hunter (2011)
  33,     // Neon Genesis Evangelion
  2047,   // Dragon Ball Z
  12609,  // Code Geass
  64,     // Ghost in the Shell: SAC
  3972,   // Cowboy Bebop
  4183,   // Fullmetal Alchemist (2003)
  75183,  // Vinland Saga
  90802,  // Chainsaw Man
  114410, // Spy x Family
  108465, // Mushoku Tensei
  119374, // Blue Lock
  126146, // Oshi no Ko
  84669,  // Dr. Stone
  85272,  // Fire Force
  88196,  // The Promised Neverland
  70523,  // Made in Abyss
  67605,  // Konosuba
  61374,  // No Game No Life
  61175,  // Kill la Kill
  62492,  // Your Lie in April
  45099,  // Assassination Classroom
  44251,  // Noragami
  44264,  // Kuroko's Basketball
  46923,  // Food Wars
  1772,   // Steins;Gate
  66881,  // Steins;Gate 0
  61023,  // Parasyte
  80797,  // Vinland Saga S2
  86831,  // Demon Slayer: Entertainment District Arc
  114893, // Demon Slayer: Swordsmith Village Arc
  119603, // Jujutsu Kaisen S2
  93752,  // Jobless Reincarnation
  48647,  // Tokyo Ravens
  60780,  // Plastic Memories
  62745,  // Charlotte
  84958,  // Kaguya-sama: Love is War
  94954,  // Bocchi the Rock
  120089, // Frieren: Beyond Journey's End
  209867, // Delicious in Dungeon
  130925, // Mashle
  135157, // Undead Unluck
  192949, // Solo Leveling
  76925,  // Bungo Stray Dogs
  65496,  // Mob Psycho 100
  65322,  // My Teen Romantic Comedy SNAFU
  70160,  // One Punch Man S2
  60664,  // Akame ga Kill
  79775,  // Darling in the FranXX
  74012,  // Sword Art Online: Alicization
  88266,  // 86 Eighty-Six
  91586,  // Ranking of Kings
  92749,  // Komi Can't Communicate
  100088, // Attack on Titan Final Season Part 2
  111110, // Attack on Titan Final Season Part 3
  76009,  // That Time I Got Reincarnated as a Slime S2
  71712,  // The Rising of the Shield Hero S2
  154977, // Zom 100
  82684,  // Demon Slayer: Mugen Train Arc
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