import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mockApi } from '../testutils/fakeApi';
import { createPhotoApi, isPhotoRequest } from '../testutils/photoApi';

function photo(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

async function mockPhotos(page: Page) {
  const api = createPhotoApi();
  await page.route((url) => isPhotoRequest(url.pathname), async (route) => {
    const request = route.request();
    const body = request.postDataBuffer();
    const response = await api.handle(new Request(request.url(), {
      method: request.method(),
      headers: request.headers(),
      body: body ? new Uint8Array(body) : undefined,
    }));
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  return api;
}

async function openPhotos(page: Page) {
  await mockApi(page, { owner: true });
  const api = await mockPhotos(page);
  await page.goto('/photos');
  return api;
}

async function uploadPhotos(page: Page, ...names: string[]) {
  const jpeg = await page.evaluate(() =>
    document.createElement('canvas').toDataURL('image/jpeg').split(',')[1],
  );
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Upload photos' }).click(),
  ]);

  await chooser.setFiles(names.map((name) => ({
    name,
    mimeType: 'image/jpeg',
    buffer: Buffer.from(jpeg, 'base64'),
  })));
}

test('can open Photos from the header', async ({ page }) => {
  await mockApi(page, { owner: true });
  await mockPhotos(page);
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
  const api = await openPhotos(page);

  await uploadPhotos(page, 'Trail.jpg', 'Shore.jpg');

  await expect.poll(() => api.received).toEqual(['Trail.jpg', 'Shore.jpg']);
  await expect(page.getByRole('button', { name: 'Upload photos' })).toBeEnabled();
  await page.reload();

  await expect(photo(page, 'Trail.jpg')).toBeVisible();
  await expect(photo(page, 'Shore.jpg')).toBeVisible();
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
