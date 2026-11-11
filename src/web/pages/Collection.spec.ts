import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi, mockPhotos } from '../testutils/fakeApi';
import { captionText, sampleCanvasCollections } from '../testutils/sampleCollections';

async function resizeCaption(page: Page, caption: Locator, dx: number, dy: number) {
  await caption.getByRole('button', { name: 'Select caption' }).click();
  const handle = caption.locator('.resize-notch');
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) throw new Error('Expected a caption resize handle');

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await mockApi(page, { owner: true, collections: sampleCanvasCollections });
  await page.goto('/collections/along-superior');
});

test('should show a photo without a title or metadata', async ({ page }) => {
  const photo = page.getByRole('article', { name: 'Photo' });

  await expect(photo.getByRole('img')).toBeVisible();
  await expect(photo).toHaveText('');
});

test('can resize a caption in both directions', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit canvas' }).click();
  const caption = page.getByRole('article', { name: 'Caption' });
  const start = await caption.boundingBox();
  if (!start) throw new Error('Expected a visible caption');

  await resizeCaption(page, caption, -60, 40);

  const end = await caption.boundingBox();
  if (!end) throw new Error('Expected a visible resized caption');

  expect(end.width - start.width).toBeCloseTo(-60, 0);
  expect(end.height - start.height).toBeCloseTo(40, 0);
});

test('should wrap caption text to fit its width', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit canvas' }).click();
  const caption = page.getByRole('article', { name: 'Caption' });
  const text = caption.getByText(captionText);
  const start = await text.boundingBox();
  if (!start) throw new Error('Expected visible caption text');
  const fontSize = await text.evaluate((element) => getComputedStyle(element).fontSize);

  await resizeCaption(page, caption, -200, 0);

  const end = await text.boundingBox();
  if (!end) throw new Error('Expected visible caption text after resizing');

  expect(end.height).toBeGreaterThan(start.height);
  await expect(text).toHaveCSS('font-size', fontSize);
});


test('can add and save a photo on a collection canvas', async ({ page }) => {
  await mockPhotos(page);
  await page.getByRole('button', { name: 'Edit canvas' }).click();
  await page.getByRole('button', { name: 'Add photo' }).click();

  const picker = page.getByRole('dialog', { name: 'Choose photo' });
  await expect(page.getByRole('article', { name: 'Photo', exact: true })).toHaveCount(1);
  await picker.getByRole('button', { name: 'Photo 1', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: 'Along Superior' }).click();

  const photos = page.getByRole('article', { name: 'Photo', exact: true });
  await expect(photos).toHaveCount(2);
  await expect(photos.last().getByRole('img')).toHaveAttribute('src', '/api/photos/sample-1');
});

test('can add and edit a caption on a collection canvas', async ({ page }) => {
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
