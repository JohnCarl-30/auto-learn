import { defineConfig } from 'vitest/config';

/**
 * These are the tests *of the scorers*, not the evals themselves.
 *
 * They call no model, cost nothing, and run in CI with `pnpm test` like any
 * other unit test. The evals proper are `pnpm eval` — a separate command,
 * because they cost money and are graded rather than passed.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
