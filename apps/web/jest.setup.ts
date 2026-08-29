import '@testing-library/jest-dom';
import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from 'node:util';

/**
 * jsdom does not implement matchMedia, and next-themes asks it what the OS
 * prefers the moment it mounts. Reporting "no preference" is the honest answer
 * for a headless environment, and it keeps the system default out of tests that
 * are about the explicit choice.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

/**
 * jsdom ships neither `TextEncoder` nor `TextDecoder`, and every browser does.
 * The NDJSON reader in `lib/api.ts` decodes stream chunks with one, so without
 * these the code under test cannot run at all — the absence is jsdom's, not
 * the browser's.
 */
Object.assign(global, {
  TextEncoder: NodeTextEncoder,
  TextDecoder: NodeTextDecoder,
});
