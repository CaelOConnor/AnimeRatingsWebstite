import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import { resolve } from 'path';

// This test suite must NEVER connect to the dev database — force NODE_ENV
// unconditionally, before anything else runs, regardless of how vitest is
// invoked (npm test, a bare `npx vitest run`, an IDE test runner, etc.).
// There is no legitimate reason to run these tests against dev data, so
// this is not conditional and not meant to be overridable. A wrong
// invocation has already wiped the real catalog twice by running test
// cleanup (DELETE FROM anime ...) against the dev DB instead of the test one.
process.env.NODE_ENV = 'test';

// Load the dedicated test env file — never the dev root .env. Keeps
// JWT_SECRET/DB_USER/DB_PASSWORD fully separate from dev (see .env.test's
// own header comment and DB_USER_TEST/DB_PASSWORD_TEST in the root .env).
config({ path: resolve(__dirname, '../.env.test') });

export default defineConfig({
  test: {
    // Belt-and-suspenders: the line above only guarantees the main
    // config-loading process. This applies NODE_ENV directly to each test
    // worker's own environment (Vitest's own mechanism for this), so it's
    // set correctly no matter which pool/runner spawns the worker.
    env: {
      NODE_ENV: 'test',
    },

    // Hard-fails immediately if NODE_ENV isn't 'test' for any reason, before
    // any test file's own imports (including db.js) run. See vitest.setup.js.
    setupFiles: ['./vitest.setup.js'],

    // use processes instead of threads for DB stability
    pool: 'forks',

    // IMPORTANT: disable parallel test files
    fileParallelism: false,

    // optional but explicit: only 1 worker
    maxWorkers: 1,
    minWorkers: 1,
  },
});