import { test, expect } from '@playwright/test';

/**
 * Milestone 7 flagship smoke test: the NovaOS workspace SPA boots, compiles the
 * default Toy C program, runs it on the real VM (prints 15), and opens a paused
 * debug session. Every assertion reflects real domain output, not mocked state.
 */
test('@smoke workspace boots and shows the toolbar', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('NovaOS');
  await expect(page.getByTestId('compile')).toBeVisible();
});

test('compiles and runs the default program (prints 15)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('output')).toContainText('15');
});

test('compiling surfaces the inspector stages', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('compile').click();
  await page.getByText('Assembly', { exact: true }).click();
  await expect(page.locator('pre')).toContainText('CALL main');
});

test('opens the concurrency lab and shows a reproducible race', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('toggle-concurrency').click();
  await expect(page.getByTestId('concurrency-lab')).toBeVisible();
  // The mutex-protected run is always correct; the unlocked run shows a RACE badge.
  await expect(page.getByTestId('race-locked')).toContainText('correct');
  await expect(page.getByTestId('race-unlocked')).toContainText('RACE');
});

test('scheduler lab compares algorithms with a Gantt chart', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('toggle-scheduler').click();
  await expect(page.getByTestId('scheduler-lab')).toBeVisible();
  // The metrics table lists every algorithm.
  await expect(page.getByTestId('metrics-row-fifo')).toBeVisible();
  await expect(page.getByTestId('metrics-row-srtf')).toBeVisible();
  await expect(page.getByTestId('metrics-row-mlfq')).toBeVisible();
  // The Gantt renders a strip per algorithm with at least one segment.
  await expect(page.getByTestId('gantt-fifo').locator('rect').first()).toBeVisible();
  // Toggling back restores the workspace editor.
  await page.getByTestId('toggle-scheduler').click();
  await expect(page.getByTestId('editor')).toBeVisible();
});

test('starts a paused debug session at entry', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('debug').click();
  await expect(page.locator('.statebadge')).toHaveText('loaded');
  // Step into descends through the `_start` bootstrap into `main` and pauses.
  await page.getByRole('button', { name: 'Step into' }).click();
  await expect(page.locator('.statebadge')).toHaveText('paused');
});
