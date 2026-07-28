import { test, expect } from '@playwright/test';
import { setupPage } from './helpers.js';

// Editing a description is the escape hatch for when the AI gets an item
// wrong, so these run with AI off: a user with no API key must still be able
// to describe their items and find them again.
test.beforeEach(async ({ page }) => {
  await setupPage(page);
  page.on('dialog', (dialog) => dialog.accept());
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

async function createBinWithOneItem(page) {
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
}

test('describe an item by hand, survive a reload, and find it by search', async ({ page }) => {
  await createBinWithOneItem(page);

  // Open the item from the bin's photo grid and write a description.
  await page.locator('#item-grid .photo-grid-item').first().click();
  await page.getByRole('button', { name: 'Edit description' }).click();
  await page.locator('#item-description-input').fill('Grandma quilt, blue and white');
  await page.getByRole('button', { name: 'Save description' }).click();
  await expect(page.getByText('Description saved')).toBeVisible();
  await expect(page.locator('#item-modal')).toContainText('Grandma quilt, blue and white');
  await expect(page.locator('#item-modal')).toContainText('Edited by you');

  // It has to still be there after the app restarts — this is the bit that
  // proves it reached IndexedDB and not just the DOM.
  await page.reload();
  await page.getByRole('button', { name: 'Bins' }).click();
  await page.locator('.bin-card').first().click();
  await page.locator('#item-grid .photo-grid-item').first().click();
  await expect(page.locator('#item-modal')).toContainText('Grandma quilt, blue and white');

  // Search is normally gated behind having an AI key; a hand-written
  // description should unlock it on its own.
  await page.getByRole('button', { name: 'Search' }).click();
  await page.locator('#search-input').fill('quilt');
  await expect(page.getByText('Grandma quilt, blue and white')).toBeVisible();
});

test('a description can be edited again and cleared', async ({ page }) => {
  await createBinWithOneItem(page);

  await page.locator('#item-grid .photo-grid-item').first().click();
  await page.getByRole('button', { name: 'Edit description' }).click();
  await page.locator('#item-description-input').fill('camping gear');
  await page.getByRole('button', { name: 'Save description' }).click();
  await expect(page.locator('#item-modal')).toContainText('camping gear');

  // Editing again starts from the current text rather than a blank box.
  await page.getByRole('button', { name: 'Edit description' }).click();
  await expect(page.locator('#item-description-input')).toHaveValue('camping gear');
  await page.locator('#item-description-input').fill('camping gear — tent poles');
  await page.getByRole('button', { name: 'Save description' }).click();
  await expect(page.locator('#item-modal')).toContainText('camping gear — tent poles');

  // With no AI description underneath, the revert button just clears it.
  await page.getByRole('button', { name: 'Clear description' }).click();
  await expect(page.getByText('Description cleared')).toBeVisible();
  await expect(page.locator('#item-modal')).toContainText('No description yet');
});
