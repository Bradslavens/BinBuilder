import { test, expect } from '@playwright/test';
import { setupPage } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await setupPage(page);
  // Auto-accept confirm() dialogs (delete confirmations, etc.).
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  // Start each test from a clean database.
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('binbuilder');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload();
});

test('photo → confirm → record items → save → edit bin', async ({ page }) => {
  await page.getByRole('button', { name: 'Log a bin' }).click();

  // Entry choice, photo path.
  await page.getByRole('button', { name: '📷 Photo of bin' }).click();

  // Viewfinder with a single-photo capture button.
  const takePhoto = page.getByRole('button', { name: '📷 Take Photo' });
  await expect(takePhoto).toBeVisible();
  await takePhoto.click();

  // Confirm the still photo (this was the previously-broken step).
  await expect(page.getByRole('heading', { name: 'Confirm bin photo' })).toBeVisible();
  await expect(page.getByRole('button', { name: '↺ Retake Photo' })).toBeVisible();
  await page.getByRole('button', { name: '✓ Use This Photo' }).click();

  // Bin saved → offered to start adding items.
  await expect(page.getByRole('heading', { name: 'Bin saved' })).toBeVisible();
  await page.getByRole('button', { name: '▶ Start Adding Items' }).click();

  // Recording, with a clear Done button and a RECORDING indicator.
  await expect(page.getByText('RECORDING')).toBeVisible();
  const done = page.getByRole('button', { name: '✓ Done Adding Items' });
  await expect(done).toBeVisible();

  // Record for a bit so live capture collects some frames, then finish.
  await page.waitForTimeout(1500);
  await done.click();

  // Review grid appears after processing.
  const saveItems = page.getByRole('button', { name: 'Save items' });
  await expect(saveItems).toBeVisible({ timeout: 20_000 });
  await saveItems.click();

  // Landed on bin detail with items and the CRUD controls.
  await expect(page.getByRole('button', { name: 'Add more items' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit bin' })).toBeVisible();

  // Update (rename + description) — the new CRUD piece.
  await page.getByRole('button', { name: 'Edit bin' }).click();
  await page.locator('#edit-bin-name').fill('Garage — Camping Gear');
  await page.locator('#edit-bin-desc').fill('Tent, stove, lantern');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('heading', { name: 'Garage — Camping Gear' })).toBeVisible();
  await expect(page.locator('#main p.muted', { hasText: 'Tent, stove, lantern' })).toBeVisible();

  // Second round: "Add more items" must work after a completed session
  // (regression test for extraction hanging on reuse).
  await page.getByRole('button', { name: 'Add more items' }).click();
  await expect(page.getByText('RECORDING')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '✓ Done Adding Items' }).click();
  const saveMore = page.getByRole('button', { name: 'Save items' });
  await expect(saveMore).toBeVisible({ timeout: 20_000 });
  await saveMore.click();
  await expect(page.getByRole('button', { name: 'Add more items' })).toBeVisible();
});

test('skip recording, then create / edit / delete a text item', async ({ page }) => {
  await page.getByRole('button', { name: 'Log a bin' }).click();
  await page.getByRole('button', { name: '📷 Photo of bin' }).click();
  await page.getByRole('button', { name: '📷 Take Photo' }).click();
  await page.getByRole('button', { name: '✓ Use This Photo' }).click();

  // Skip the recording step — go straight to the (empty) bin.
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByText('No items yet.')).toBeVisible();

  // Create a text-only item.
  await page.getByRole('button', { name: 'Quick add (text only)' }).click();
  await page.locator('#quick-add-input').fill('Socket wrench set');
  await page.getByRole('button', { name: 'Save text item' }).click();
  await expect(page.getByText('1 item')).toBeVisible();

  // Read/Update: open the item and rename its label.
  await page.locator('#item-grid .photo-grid-item').first().click();
  await page.locator('#item-label').fill('Metric socket set');
  await page.getByRole('button', { name: 'Save label' }).click();

  // Delete the item.
  await page.locator('#item-grid .photo-grid-item').first().click();
  await page.getByRole('button', { name: 'Delete item' }).click();
  await expect(page.getByText('No items yet.')).toBeVisible();

  // Delete the bin → back to the bins list.
  await page.getByRole('button', { name: 'Delete bin' }).click();
  await expect(page.getByRole('heading', { name: 'Bins' })).toBeVisible();
});
