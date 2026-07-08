import { test, expect } from '@playwright/test';
import { setupPage } from './helpers.js';

// The OpenRouter API is mocked, so this exercises everything on our side:
// key setup in More, background naming after saving an item, and search
// finding the item by its AI name.
test.beforeEach(async ({ page }) => {
  await setupPage(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.route('https://openrouter.ai/**', (route) =>
    route.fulfill({ json: { choices: [{ message: { content: 'TV remote' } }] } }),
  );
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('binbuilder');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload();
});

test('key in More → item auto-named → searchable as "remote"', async ({ page }) => {
  // The home banner nudges toward setup and opens More.
  await page.getByText('Maximize your experience').click();

  // Save a key (mocked API — any value works).
  await page.locator('#ai-key').fill('sk-or-test-key');
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText('Key saved')).toBeVisible();

  // Test key round-trips through the (mocked) API.
  await page.getByRole('button', { name: 'Test key' }).click();
  await expect(page.getByText('Key works ✓')).toBeVisible();

  // Create a bin with one tapped item.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Log a bin' }).click();
  await page.getByRole('button', { name: '📷 Photo of bin' }).click();
  await page.getByRole('button', { name: '📷 Take Photo' }).click();
  await page.getByRole('button', { name: '✓ Use This Photo' }).click();
  await page.getByRole('button', { name: '▶ Start Adding Items' }).click();
  await expect(page.locator('.camera-hint')).toContainText('tap the screen to capture', { timeout: 10_000 });
  await page.locator('video.camera-video').click();
  await expect(page.getByText('1 item captured')).toBeVisible();
  await page.getByRole('button', { name: '✓ Done Adding Items' }).click();
  await page.getByRole('button', { name: 'Save items' }).click();
  await expect(page.getByRole('button', { name: 'Add more items' })).toBeVisible();

  // Background naming runs async after save — wait for the write to land
  // before opening search (which snapshots items when it renders).
  await expect
    .poll(() => page.evaluate(() => new Promise((resolve) => {
      const req = indexedDB.open('binbuilder');
      req.onsuccess = () => {
        const db = req.result;
        const all = db.transaction('items').objectStore('items').getAll();
        all.onsuccess = () => {
          db.close();
          resolve(all.result.map((i) => i.aiLabel));
        };
      };
    })), { timeout: 15_000 })
    .toContain('TV remote');

  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Search' }).click();
  await page.locator('#search-input').fill('remote');
  await expect(page.getByText('TV remote')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('AI name')).toBeVisible();
});
