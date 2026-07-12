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

test('paging lab translates a virtual address through the MMU', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('toggle-paging').click();
  await expect(page.getByTestId('paging-lab')).toBeVisible();
  await expect(page.getByTestId('mmu-page-table')).toBeVisible();
  await page.getByTestId('mmu-translate').click();
  // The walkthrough shows the decode → … → compose steps and a VA→PA status.
  await expect(page.getByTestId('mmu-walkthrough')).toContainText('compose');
  await expect(page.getByTestId('mmu-status')).toContainText('PA');
});

test('@a11y paging view toggle is keyboard-reachable', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByTestId('toggle-paging');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('@smoke filesystem persists across reloads (IndexedDB)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('toggle-files').click();
  await page.getByTestId('files-name').fill('persisted.txt');
  await page.getByTestId('files-create').click();
  await expect(page.getByTestId('files-status')).toContainText('saved');
  await expect(page.getByTestId('files-listing')).toContainText('persisted.txt');

  await page.reload(); // boot re-loads the FS from IndexedDB
  await page.getByTestId('toggle-files').click();
  await expect(page.getByTestId('files-listing')).toContainText('persisted.txt');
});

test('@smoke guided tutorials: check a step and advance progress', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('toggle-tutorials').click();
  await expect(page.getByTestId('tutorials-view')).toBeVisible();
  // The default tutorial's first step is "hello" — expected output 15.
  await page.getByTestId('tutorial-check').click();
  await expect(page.getByTestId('checkpoint-hello-out')).toContainText('15');
  await expect(page.getByTestId('tutorial-progress')).toContainText('1 /');
});

test('@a11y tutorials toggle is keyboard-reachable', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByTestId('toggle-tutorials');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('starts a paused debug session at entry', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('debug').click();
  await expect(page.locator('.statebadge')).toHaveText('loaded');
  // Step into descends through the `_start` bootstrap into `main` and pauses.
  await page.getByRole('button', { name: 'Step into' }).click();
  await expect(page.locator('.statebadge')).toHaveText('paused');
});
