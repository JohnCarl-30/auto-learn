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
  // The `@/` alias that tsconfig defines and the application code uses
  // throughout. next/jest does not carry it into the resolver, which is why the
  // older tests here all reach for relative paths instead; a test should not
  // have to import a module differently from the way the module is written.
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  testPathIgnorePatterns: ['<rootDir>/e2e/', '<rootDir>/.next/'],
};

export default createJestConfig(config);
