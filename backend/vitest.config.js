import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env file
config({ path: resolve(__dirname, '../.env') });

export default defineConfig({
  test: {
    // use processes instead of threads for DB stability
    pool: 'forks',

    // IMPORTANT: disable parallel test files
    fileParallelism: false,

    // optional but explicit: only 1 worker
    maxWorkers: 1,
    minWorkers: 1,
  },
});