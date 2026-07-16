/**
 * verify-tmdb-ids.js
 * -------------------
 * Looks up the correct TMDB TV id for each title below by calling TMDB's
 * own search endpoint, instead of trusting hand-typed ids that might be
 * wrong (as several in seed.js turned out to be — e.g. Sword Art Online
 * was listed as 11757, but its real id is 45782).
 *
 * This does NOT touch your database or call your own backend at all —
 * it only talks to TMDB directly, using the same TMDB_API_KEY your
 * backend already uses. Safe to run as many times as you want.
 *
 * Usage:
 *   docker compose exec backend node verify-tmdb-ids.js
 *
 * For each title it prints up to 3 candidate matches from TMDB with
 * their id, name, and first-air-date, so you can eyeball which one is
 * actually correct — auto-picking the #1 result is risky since some
 * anime titles collide with unrelated live-action shows of the same name.
 */

const apiKey = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';

if (!apiKey) {
  console.error('Error: TMDB_API_KEY is not set in the environment.');
  process.exit(1);
}

// Only the titles that failed in the last seed run (old id kept for reference).
// Add/remove entries here as needed — query is what gets searched on TMDB.
const TITLES = [
  { oldId: 11757,  query: 'Sword Art Online' },
  { oldId: 44217,  query: 'Black Clover' },
  { oldId: 78804,  query: 'That Time I Got Reincarnated as a Slime' },
  { oldId: 40748,  query: 'Fairy Tail' },
  { oldId: 1530,   query: 'Naruto' },
  { oldId: 33,     query: 'Neon Genesis Evangelion' },
  { oldId: 2047,   query: 'Dragon Ball Z' },
  { oldId: 64,     query: 'Ghost in the Shell: Stand Alone Complex' },
  { oldId: 3972,   query: 'Cowboy Bebop' },
  { oldId: 4183,   query: 'Fullmetal Alchemist' },
  { oldId: 75183,  query: 'Vinland Saga' },
  { oldId: 90802,  query: 'Chainsaw Man' },
  { oldId: 108465, query: 'Mushoku Tensei' },
  { oldId: 119374, query: 'Blue Lock' },
  { oldId: 126146, query: 'Oshi no Ko' },
  { oldId: 85272,  query: 'Fire Force' },
  { oldId: 88196,  query: 'The Promised Neverland' },
  { oldId: 70523,  query: 'Made in Abyss' },
  { oldId: 67605,  query: 'Konosuba' },
  { oldId: 61175,  query: 'Kill la Kill' },
  { oldId: 62492,  query: 'Your Lie in April' },
  { oldId: 45099,  query: 'Assassination Classroom' },
  { oldId: 44251,  query: 'Noragami' },
  { oldId: 44264,  query: "Kuroko's Basketball" },
  { oldId: 46923,  query: 'Food Wars: Shokugeki no Soma' },
  { oldId: 1772,   query: "Steins;Gate" },
  { oldId: 66881,  query: "Steins;Gate 0" },
  { oldId: 61023,  query: 'Parasyte -the maxim-' },
  { oldId: 86831,  query: 'Demon Slayer Entertainment District Arc' },
  { oldId: 114893, query: 'Demon Slayer Swordsmith Village Arc' },
  { oldId: 119603, query: 'Jujutsu Kaisen' },
  { oldId: 93752,  query: 'Mushoku Tensei Jobless Reincarnation' },
  { oldId: 48647,  query: 'Tokyo Ravens' },
  { oldId: 60780,  query: 'Plastic Memories' },
  { oldId: 84958,  query: 'Kaguya-sama Love is War' },
  { oldId: 94954,  query: 'Bocchi the Rock' },
  { oldId: 130925, query: 'Mashle' },
  { oldId: 135157, query: 'Undead Unluck' },
  { oldId: 192949, query: 'Solo Leveling' },
  { oldId: 76925,  query: 'Bungo Stray Dogs' },
  { oldId: 65496,  query: 'Mob Psycho 100' },
  { oldId: 65322,  query: 'My Teen Romantic Comedy SNAFU' },
  { oldId: 70160,  query: 'One Punch Man' },
  { oldId: 60664,  query: 'Akame ga Kill' },
  { oldId: 79775,  query: 'Darling in the Franxx' },
  { oldId: 74012,  query: 'Sword Art Online Alicization' },
  { oldId: 88266,  query: '86 Eighty-Six' },
  { oldId: 91586,  query: 'Ranking of Kings' },
  { oldId: 92749,  query: "Komi Can't Communicate" },
  { oldId: 100088, query: 'Attack on Titan' },
  { oldId: 76009,  query: 'That Time I Got Reincarnated as a Slime' },
  { oldId: 71712,  query: 'The Rising of the Shield Hero' },
  { oldId: 154977, query: 'Zom 100 Bucket List of the Dead' },
];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchTv(titleQuery) {
  const url = `${TMDB_BASE_URL}/search/tv?query=${encodeURIComponent(titleQuery)}&language=en-US&page=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`TMDB search failed: ${res.status}`);
  }
  const data = await res.json();
  return data.results ?? [];
}

async function main() {
  console.log(`Verifying ${TITLES.length} titles against TMDB...\n`);

  for (const { oldId, query: titleQuery } of TITLES) {
    try {
      const results = await searchTv(titleQuery);

      if (results.length === 0) {
        console.log(`"${titleQuery}" (old id ${oldId}) → NO RESULTS on TMDB\n`);
      } else {
        console.log(`"${titleQuery}" (old id ${oldId}):`);
        results.slice(0, 3).forEach((r, i) => {
          const marker = r.id === oldId ? '  <-- matches old id' : '';
          console.log(
            `  ${i + 1}. id=${r.id}  "${r.name}"  first_air_date=${r.first_air_date || 'n/a'}${marker}`
          );
        });
        console.log('');
      }
    } catch (err) {
      console.log(`"${titleQuery}" (old id ${oldId}) → ERROR: ${err.message}\n`);
    }

    await delay(250); // stay comfortably under TMDB's rate limit
  }

  console.log('Done. Copy the correct id for each title into seed.js.');
}

main().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});