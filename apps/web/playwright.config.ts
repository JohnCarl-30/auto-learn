import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Both halves, because the interesting assertions are about what the server
  // does and does not send — the sentence cap and the withheld replacement.
  // `reuseExistingServer` so a dev already running these does not fight it.
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      port: 3001,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm start',
      port: 3000,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
