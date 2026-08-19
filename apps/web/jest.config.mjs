import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

/**
 * Component and hook tests for the web app.
 *
 * `e2e/` is excluded deliberately — those are Playwright specs, and jest would
 * otherwise try to run them. The split across the repo:
 *
 *   apps/api    *.spec.ts   jest      *.test.ts   vitest
 *   apps/web    *.test.tsx  jest      e2e/*.spec.ts  Playwright
 */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['<rootDir>/e2e/', '<rootDir>/.next/'],
};

export default createJestConfig(config);
