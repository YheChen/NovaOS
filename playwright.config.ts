import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright skeleton. The NovaOS web app is not implemented until Milestone 7,
 * so this configuration exists to keep the E2E harness wired and green. The
 * `webServer` block is intentionally commented out and will be enabled once
 * `apps/web` serves a real workspace.
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
  // webServer: {
  //   command: 'pnpm --filter @novaos/web dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
