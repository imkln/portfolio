import { expect, test } from '@playwright/test';
import { mockApi, mockPhotos } from '../testutils/fakeApi';
import { sampleCollectionItems } from '../testutils/sampleCollections';

const collectionPath = '/collections/along-superior';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await mockApi(page, { owner: true, itemsByCollection: { 'along-superior': sampleCollectionItems } });
});

test('should show when a collection is missing', async ({ page }) => {
  await page.goto('/collections/missing');

  await expect(page.getByRole('alert')).toHaveText('Collection not found.');
});

test('should show when a collection fails to load', async ({ page }) => {
  await page.route('**/api/collections/along-superior', (route) =>
    route.fulfill({ status: 500 }),
  );

  await page.goto(collectionPath);

  await expect(page.getByRole('alert')).toHaveText('Could not load collection.');
});

test('can add and save a photo on a collection canvas', async ({ page }) => {
  await mockPhotos(page);
  await page.goto(collectionPath);
  await page.getByRole('button', { name: 'Edit canvas' }).click();
  await page.getByRole('button', { name: 'Add photo' }).click();

  const picker = page.getByRole('dialog', { name: 'Choose photo' });
  await expect(page.getByRole('article', { name: 'Photo', exact: true })).toHaveCount(1);
  await picker.getByRole('button', { name: 'Photo 1', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('button', { name: 'Edit canvas' })).toBeVisible();
  await page.reload();

  const photos = page.getByRole('article', { name: 'Photo', exact: true });
  await expect(photos).toHaveCount(2);
  await expect(photos.last().getByRole('img')).toHaveAttribute('src', '/api/photos/sample-1');
});

test('can add and edit a caption on a collection canvas', async ({ page }) => {
  await page.goto(collectionPath);
  await page.getByRole('button', { name: 'Edit canvas' }).click();
  await page.getByRole('button', { name: 'Add caption' }).click();

  const caption = page.getByRole('article', { name: 'Caption' }).filter({ hasText: 'Add text' });
  await caption.getByRole('button', { name: 'Select caption' }).click();
  const editor = page.getByRole('textbox', { name: 'Caption text' });
  await expect(editor).toBeFocused();
  await editor.fill('Waves breaking along the shore.');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Waves breaking along the shore.', { exact: true })).toBeVisible();
});
