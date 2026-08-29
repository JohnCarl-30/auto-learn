import { defineConfig, devices } from '@playwright/test';

/*
  Ports, overridable.

  They were hardcoded, which collides with whatever else a developer has on
  3000 and 3001 — and `reuseExistingServer` turns that collision into the worst
  kind of failure, silently running the suite against someone else's app
  instead of refusing to start.

  Note that the web bundle bakes NEXT_PUBLIC_API_URL at build time, so pointing
  the suite at a non-default API port means rebuilding with it:

    NEXT_PUBLIC_API_URL=http://localhost:3999 pnpm build
    E2E_API_PORT=3999 E2E_WEB_PORT=3998 pnpm test:e2e
*/
const API_PORT = Number(process.env.E2E_API_PORT ?? 3001);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3000);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Both halves, because the interesting assertions are about what the server
  // does and does not send — the sentence cap and the withheld replacement.
  // `reuseExistingServer` so a dev already running these does not fight it.
  webServer: [
    {
      // WEB_ORIGIN too: the API's CORS allowlist defaults to port 3000, so on
      // any other web port the browser is refused and every test fails as
      // "can't reach the server" — including the ones that never call a model.
      command: `PORT=${API_PORT} WEB_ORIGIN=http://localhost:${WEB_PORT} node ../api/dist/main.js`,
      port: API_PORT,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `PORT=${WEB_PORT} pnpm start`,
      port: WEB_PORT,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
