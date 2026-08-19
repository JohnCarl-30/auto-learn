import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Deliberately disjoint from jest's `*.spec.ts`. The two runners split by
    // filename so neither ever picks up the other's files:
    //   *.spec.ts  -> jest    (Nest unit tests; ESM mocked at the boundary)
    //   *.test.ts  -> vitest  (tests that need the real ESM packages)
    include: ['src/**/*.test.ts'],
  },
  // Nest needs legacy decorators and design-time metadata, which vitest's
  // default esbuild transform does not emit. swc does.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
