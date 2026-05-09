import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load the root .env file (one level up from /backend)
config({ path: resolve(__dirname, '../.env') });

export default defineConfig({
  test: {
    // Run tests sequentially — important since they share a real DB
    // Parallel tests would cause race conditions on inserts/deletes
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});