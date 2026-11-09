import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mockApi } from '../testutils/fakeApi';

function photo(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

async function openPhotos(page: Page) {
  await mockApi(page, { owner: true });
  await page.goto('/photos');
}

test('can open Photos from the header', async ({ page }) => {
  await mockApi(page, { owner: true });
  await page.goto('/');

  const navigation = page.getByRole('banner').getByRole('navigation');
  await expect(navigation.getByRole('link', { name: 'Home' })).toBeVisible();
  await navigation.getByRole('link', { name: 'Photos' }).click();

  await expect(page).toHaveURL(/\/photos$/);
  await expect(page.getByRole('region', { name: 'Photos' })).toBeVisible();
});

test('should hide Photos from non-owners', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Photos' })).toHaveCount(0);
});

test('can upload several photos at once', async ({ page }) => {
  await openPhotos(page);

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Upload photos' }).click(),
  ]);
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
    'base64',
  );
  await chooser.setFiles([
    { name: 'Trail.png', mimeType: 'image/png', buffer: image },
    { name: 'Shore.png', mimeType: 'image/png', buffer: image },
  ]);

  await expect(photo(page, 'Trail.png')).toBeVisible();
  await expect(photo(page, 'Shore.png')).toBeVisible();
});

test('can load more photos by scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPhotos(page);

  const olderPhoto = photo(page, 'Photo 25');
  await expect(photo(page, 'Photo 1')).toBeVisible();
  await expect(olderPhoto).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  await expect(olderPhoto).toBeVisible();
});

test('can open the original photo', async ({ page }) => {
  await openPhotos(page);

  const thumbnail = photo(page, 'Photo 1');
  const thumbnailSource = await thumbnail
    .getByRole('img')
    .evaluate((image: HTMLImageElement) => image.src);
  await thumbnail.click();

  const viewer = page.getByRole('dialog');
  const original = viewer.getByRole('img', { name: 'Photo 1' });
  await expect(original).toBeVisible();
  await expect(original).not.toHaveAttribute('src', thumbnailSource);
  await expect(viewer.getByRole('button', { name: 'Close' })).toBeVisible();
});

test('can close the photo with Escape', async ({ page }) => {
  await openPhotos(page);
  const thumbnail = photo(page, 'Photo 1');
  await thumbnail.click();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(thumbnail).toBeFocused();
});

test('can toggle a photo in selection mode', async ({ page }) => {
  await openPhotos(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const thumbnail = photo(page, 'Photo 1');

  await thumbnail.click();
  await expect(page.getByRole('status')).toHaveText('1 selected');

  await thumbnail.click();
  await expect(page.getByRole('status')).toHaveText('0 selected');
});

test('can select a range with Shift-click', async ({ page }) => {
  await openPhotos(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();

  await photo(page, 'Photo 2').click();
  await photo(page, 'Photo 4').click({ modifiers: ['Shift'] });

  await expect(photo(page, 'Photo 2')).toHaveAttribute('aria-pressed', 'true');
  await expect(photo(page, 'Photo 3')).toHaveAttribute('aria-pressed', 'true');
  await expect(photo(page, 'Photo 4')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status')).toHaveText('3 selected');
});

test('can cancel photo deletion', async ({ page }) => {
  await openPhotos(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const thumbnail = photo(page, 'Photo 1');
  await thumbnail.click();

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  await expect(thumbnail).toHaveAttribute('aria-pressed', 'true');
});

test('can delete selected photos after confirming', async ({ page }) => {
  await openPhotos(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const thumbnail = photo(page, 'Photo 1');
  await thumbnail.click();

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

  await expect(thumbnail).toHaveCount(0);
});

test('can leave selection mode with Done', async ({ page }) => {
  await openPhotos(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await photo(page, 'Photo 1').click();

  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByRole('button', { name: 'Upload photos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeVisible();
  await expect(photo(page, 'Photo 1')).not.toHaveAttribute('aria-pressed');
});
