import { test, expect } from '@playwright/test';

/**
 * Milestone 0 placeholder smoke test.
 *
 * The NovaOS web app does not exist yet (it arrives in Milestone 7). This test
 * keeps the Playwright harness wired and green without launching a browser — it
 * never requests the `page` fixture, so no browser binary is required to run it.
 *
 * When `apps/web` serves a real workspace, this will be replaced by the flagship
 * boot → open → compile → run → debug → step → inspect → timeline flow.
 */
test('@smoke playwright harness is configured', () => {
  expect(true).toBe(true);
});
