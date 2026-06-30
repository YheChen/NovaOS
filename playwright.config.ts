import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright drives the built NovaOS workspace SPA (Milestone 7). The webServer
 * block builds `apps/web` and serves it with `vite preview` on port 3000.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // In CI, emit GitHub annotations *and* an HTML report so the on-failure
  // artifact upload has something to attach. Locally, a plain list is enough.
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @novaos/web build && pnpm --filter @novaos/web preview',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
