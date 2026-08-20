import '@testing-library/jest-dom';

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
