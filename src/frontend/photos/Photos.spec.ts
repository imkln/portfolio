import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { samplePhotos } from '../testutils/samplePhotos';
import { mockApi, mockPhotos } from '../testutils/fakeApi';

function photo(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
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

test('can upload several photos at once', async ({ page }) => {
  const api = await openPhotos(page);

  await uploadPhotos(page, 'Trail.jpg', 'Shore.jpg');

  await expect.poll(() => api.received).toEqual(['Trail.jpg', 'Shore.jpg']);
  await expect(page.getByRole('button', { name: 'Upload photos' })).toBeEnabled();
  await page.reload();

  await expect(photo(page, 'Trail.jpg')).toBeVisible();
  await expect(photo(page, 'Shore.jpg')).toBeVisible();
});

test('should report a failed upload', async ({ page }) => {
  await openPhotos(page);
  await page.route('**/test-photo-uploads/*', (route) => route.fulfill({ status: 500 }));

  await uploadPhotos(page, 'Trail.jpg');

  await expect(page.getByRole('alert')).toHaveText('Some photos could not be uploaded.');
  await expect(page.getByRole('button', { name: 'Upload photos' })).toBeEnabled();
});

test('should ask for a JPEG when the selected file is unsupported', async ({ page }) => {
  await openPhotos(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('notes'),
  });

  await expect(page.getByRole('alert')).toHaveText('Choose JPEG photos to upload.');
});

test('should show when the photo library is empty', async ({ page }) => {
  await mockPhotos(page);
  await page.route('**/api/photos', (route) => route.fulfill({ json: { photos: [] } }));
  await mockApi(page, { owner: true });

  await page.goto('/photos');

  await expect(page.getByText('No photos yet.')).toBeVisible();
});

test('should show when photos fail to load', async ({ page }) => {
  await mockPhotos(page);
  await page.route('**/api/photos', (route) => route.fulfill({ status: 500 }));
  await mockApi(page, { owner: true });

  await page.goto('/photos');

  await expect(page.getByRole('alert')).toHaveText('Could not load photos.');
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

test('should keep loaded photos visible when the next page fails', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPhotos(page);
  await page.route(
    (url) => url.pathname === '/api/photos' && url.searchParams.has('pageToken'),
    (route) => route.fulfill({ status: 500 }),
  );
  await expect(photo(page, 'Photo 1')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  await expect(page.getByRole('alert')).toHaveText('Could not load photos.');
  await expect(photo(page, 'Photo 1')).toBeVisible();
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

test('can open the previous photo with left arrow', async ({ page }) => {
  await openPhotos(page);
  await photo(page, 'Photo 2').click();

  await page.keyboard.press('ArrowLeft');

  const viewer = page.getByRole('dialog', { name: 'Photo viewer' });
  await expect(viewer.getByRole('img', { name: 'Photo 1', exact: true })).toBeVisible();
});

test('can open the next page of photos with right arrow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPhotos(page);
  await photo(page, 'Photo 1').click();
  const viewer = page.getByRole('dialog', { name: 'Photo viewer' });

  for (let index = 1; index < 24; index++) {
    await page.keyboard.press('ArrowRight');
  }
  await expect(viewer.getByRole('img', { name: 'Photo 24', exact: true })).toBeVisible();

  await page.keyboard.press('ArrowRight');

  await expect(viewer.getByRole('img', { name: 'Photo 25', exact: true })).toBeVisible();
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

test('can retry a photo deletion after a partial failure', async ({ page }) => {
  await openPhotos(page);
  await page.route('**/api/photos/sample-1', (route) =>
    route.fulfill({ status: 500 }),
  );
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const failed = photo(page, 'Photo 1');
  const deleted = photo(page, 'Photo 2');
  await failed.click();
  await deleted.click();

  const deleteButton = page.getByRole('button', { name: 'Delete', exact: true });
  await deleteButton.click();

  await expect(page.getByRole('alert')).toHaveText('Some photos could not be deleted.');
  await expect(failed).toHaveAttribute('aria-pressed', 'true');
  await expect(deleted).toHaveCount(0);

  await page.unroute('**/api/photos/sample-1');
  await deleteButton.click();

  await expect(failed).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
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

const france = { id: 'france', name: 'France' };

async function openTagLibrary(page: Page, tagIds: string[][] = [[], []]) {
  await mockApi(page, { owner: true });
  await mockPhotos(page, tagIds.map((ids, index) => ({ ...samplePhotos[index], tagIds: ids })), [france]);
  await page.goto('/photos');
}

test('can edit tags on selected photos', async ({ page }) => {
  await openTagLibrary(page, [[], [], []]);
  await photo(page, 'Select').click();
  await photo(page, 'Photo 1').click();
  await photo(page, 'Photo 2').click();
  await photo(page, 'Edit tags').click();
  await photo(page, 'France').click();

  const saved = page.waitForRequest((request) => request.method() === 'PATCH' && new URL(request.url()).pathname === '/api/photos');
  await photo(page, 'Apply changes').click();

  expect((await saved).postDataJSON()).toEqual({
    photoIds: ['sample-1', 'sample-2'], addTagIds: ['france'], removeTagIds: [],
  });
  await expect(photo(page, 'Select')).toBeVisible();
});

test('can create a tag', async ({ page }) => {
  await openTagLibrary(page);
  await photo(page, 'New tag').click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Nature');
  await photo(page, 'Create').click();

  await photo(page, 'Filter by tags').click();
  await expect(photo(page, 'Nature')).toBeVisible();
});

test('can delete a tag', async ({ page }) => {
  await openTagLibrary(page, [['france'], []]);
  await photo(page, 'Filter by tags').click();
  await photo(page, 'France').click();
  await photo(page, 'Manage tags').click();
  await photo(page, 'France').click();
  await photo(page, 'Delete tag').click();

  await expect(page.getByRole('dialog').getByRole('button', { name: 'France', exact: true })).toHaveCount(0);
  await photo(page, 'Done').click();
  await expect(photo(page, 'Clear all')).toHaveCount(0);
  await expect(photo(page, 'Photo 2')).toBeVisible();
});

test('should show when tags fail to load', async ({ page }) => {
  await mockApi(page, { owner: true });
  await mockPhotos(page, samplePhotos.slice(0, 1));
  await page.route('**/api/tags', (route) => route.fulfill({ status: 500 }));

  await page.goto('/photos');

  await expect(page.getByRole('alert')).toHaveText('Could not load tags.');
  await photo(page, 'Photo 1').click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
