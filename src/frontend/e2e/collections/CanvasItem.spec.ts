import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockApi } from '../../src/testing/fakeApi';
import { captionText, sampleCollectionItems, sampleCollections } from '../../src/testing/sampleCollections';

async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) throw new Error('Expected a visible drag target');

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

async function resizeCaption(page: Page, caption: Locator, dx: number, dy: number) {
  await caption.getByRole('button', { name: 'Select caption' }).click();
  await drag(page, caption.getByTitle('Resize caption'), dx, dy);
}

test('should display a portrait cover at its original aspect ratio', async ({ page }) => {
  const image = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="100%" height="100%" /></svg>';
  await mockApi(page, {
    collections: [{ ...sampleCollections[0], coverPhotoUrl: `data:image/svg+xml,${encodeURIComponent(image)}` }],
  });
  await page.goto('/');

  const ratio = await page.getByRole('img', { name: 'Collection cover' })
    .evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      const { width, height } = image.getBoundingClientRect();
      return width / height;
    });

  expect(ratio).toBeCloseTo(2 / 3, 2);
});

test.describe('collection canvas items', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 850 });
    await mockApi(page, { owner: true, itemsByCollection: { 'along-superior': sampleCollectionItems } });
    await page.goto('/collections/along-superior');
  });

  test('should show a photo without a title or metadata', async ({ page }) => {
    const photo = page.getByRole('article', { name: 'Photo' });

    await expect(photo.getByRole('img')).toBeVisible();
    await expect(photo).toHaveText('');
  });

  test('can drag a selected photo', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit canvas' }).click();
    const photo = page.getByRole('article', { name: 'Photo', exact: true });
    const handle = photo.getByRole('button', { name: 'Select Photo' });
    await handle.click();
    const start = await photo.boundingBox();
    if (!start) throw new Error('Expected a visible photo');

    await drag(page, handle, 24, 32);

    const moved = await photo.boundingBox();
    if (!moved) throw new Error('Expected a visible photo after dragging');
    expect(moved.x).toBeGreaterThan(start.x);
    expect(moved.y).toBeGreaterThan(start.y);
  });

  test('can resize a caption in both directions', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit canvas' }).click();
    const caption = page.getByRole('article', { name: 'Caption' });
    const start = await caption.boundingBox();
    if (!start) throw new Error('Expected a visible caption');

    await resizeCaption(page, caption, -60, 40);

    const end = await caption.boundingBox();
    if (!end) throw new Error('Expected a visible resized caption');

    expect(end.width).toBeLessThan(start.width);
    expect(end.height).toBeGreaterThan(start.height);
  });

  test('should wrap caption text to fit its width', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit canvas' }).click();
    const caption = page.getByRole('article', { name: 'Caption' });
    const text = caption.getByText(captionText);
    const start = await text.boundingBox();
    if (!start) throw new Error('Expected visible caption text');

    await resizeCaption(page, caption, -200, 0);

    const end = await text.boundingBox();
    if (!end) throw new Error('Expected visible caption text after resizing');

    expect(end.height).toBeGreaterThan(start.height);
  });
});
