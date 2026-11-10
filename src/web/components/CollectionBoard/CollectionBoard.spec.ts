import { expect, test, type Locator, type Page } from '@playwright/test';
import { sampleCollections, sampleCoverThumbnail } from '../../testutils/sampleCollections';
import { samplePhotos } from '../../testutils/samplePhotos';
import { mockApi, mockPhotos } from '../../testutils/fakeApi';

function board(page: Page) {
  return page.getByRole('region', { name: 'Collections' });
}

function collection(page: Page, title: string) {
  return board(page).getByRole('article', { name: title });
}

async function bounds(element: Locator) {
  const box = await element.boundingBox();
  if (!box) throw new Error('Expected a visible element');

  return box;
}

async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  await handle.scrollIntoViewIfNeeded();
  const box = await bounds(handle);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

async function selectFirst(page: Page) {
  const first = collection(page, 'Along Superior');

  await page.getByRole('button', { name: 'Edit collections' }).click();
  await first.getByRole('button', { name: 'Select Along Superior' }).click();

  return first;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await mockApi(page, { owner: true });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Edit collections' }),
  ).toBeVisible();
});

test('should position a collection using its layout', async ({ page }) => {
  const config = sampleCollections.find(({ id }) => id === 'freight-country');
  if (!config) throw new Error('Missing Freight Country sample collection');

  const frame = await bounds(board(page));
  const item = await bounds(collection(page, config.title));

  expect((item.x - frame.x) / frame.width).toBeCloseTo(config.x, 3);
  expect((item.y - frame.y) / frame.width).toBeCloseTo(config.y, 3);
  expect(item.width / frame.width).toBeCloseTo(config.width, 3);
});

test('can move a selected collection', async ({ page }) => {
  const first = await selectFirst(page);
  const start = await bounds(first);
  const neighbor = await bounds(collection(page, 'Freight Country'));
  const x = neighbor.x - start.width / 2;
  const y = neighbor.y;

  await drag(
    page,
    first.getByRole('button', { name: 'Select Along Superior' }),
    x - start.x,
    y - start.y,
  );

  const moved = await bounds(first);
  expect(moved.x).toBeCloseTo(x, 0);
  expect(moved.y).toBeCloseTo(y, 0);
});

test('can resize a selected collection', async ({ page }) => {
  const first = await selectFirst(page);
  const cover = first.getByRole('button', { name: 'Select Along Superior' });
  const start = await bounds(cover);

  await drag(page, first.locator('.resize-notch'), 60, 0);

  const resized = await bounds(cover);
  expect(resized.width - start.width).toBeCloseTo(60, 0);
  expect(resized.width / resized.height).toBeCloseTo(
    start.width / start.height,
  );
});

test('can select a collection with the keyboard', async ({ page }) => {
  const edit = page.getByRole('button', { name: 'Edit collections' });
  const first = collection(page, 'Along Superior');
  await edit.focus();

  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(
    first.getByRole('button', { name: 'Select Along Superior' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(
    first.getByRole('button', { name: 'Delete collection' }),
  ).toBeVisible();
});

test('can nudge the selected collection with arrow keys', async ({ page }) => {
  const first = await selectFirst(page);
  const start = await bounds(first);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');

  const moved = await bounds(first);
  expect(moved.x).toBeGreaterThan(start.x);
  expect(moved.y).toBeGreaterThan(start.y);
  expect(moved.width).toBeCloseTo(start.width);
});

test('should leave arrow keys available when editing text', async ({
  page,
}) => {
  const first = await selectFirst(page);
  const start = await bounds(first);
  const startFrame = await bounds(board(page));
  await first
    .getByRole('button', { name: 'Along Superior', exact: true })
    .click();
  const title = first.getByRole('textbox', { name: 'Collection title' });
  await title.press('End');

  await title.press('ArrowLeft');
  await page.keyboard.insertText('!');

  await expect(title).toHaveValue('Along Superio!r');
  const position = await bounds(first);
  const frame = await bounds(board(page));
  expect(position.x - frame.x).toBeCloseTo(start.x - startFrame.x);
  expect(position.y - frame.y).toBeCloseTo(start.y - startFrame.y);
});

test('should scroll to and select the new collection', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 650 });
  await page.getByRole('button', { name: 'Edit collections' }).click();

  await page.getByRole('button', { name: 'Add collection' }).click();

  const added = collection(page, 'Untitled collection');
  await expect(added).toBeInViewport({ ratio: 0.9 });
  await expect(
    added.getByRole('button', { name: 'Delete collection' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
});

test('can choose a collection cover', async ({ page }) => {
  await mockPhotos(page);
  const first = await selectFirst(page);

  await first.getByRole('button', { name: 'Choose cover photo' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose cover photo' });
  await picker.getByRole('button', { name: 'Photo 1', exact: true }).click();

  await expect(picker).toBeHidden();
  await expect(first.getByRole('img', { name: 'Collection cover' }))
    .toHaveAttribute('src', '/api/photos/sample-1/thumbnail');
});

test('can close the cover picker without changing the cover', async ({ page }) => {
  await mockPhotos(page);
  const first = await selectFirst(page);
  const button = first.getByRole('button', { name: 'Choose cover photo' });
  const cover = first.getByRole('img', { name: 'Collection cover' });
  await expect(cover).toHaveAttribute('src', sampleCoverThumbnail);
  await button.click();
  const picker = page.getByRole('dialog', { name: 'Choose cover photo' });
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(picker).toBeHidden();
  await expect(cover).toHaveAttribute('src', sampleCoverThumbnail);
  await expect(button).toBeFocused();
});

test('should send edits to the API and return to view mode', async ({
  page,
}) => {
  await mockPhotos(page);
  let savedCollections: typeof sampleCollections | undefined;
  await page.route('**/api/collections', (route) => {
    if (route.request().method() === 'PUT') {
      const { collections }: { collections: typeof sampleCollections } =
        route.request().postDataJSON();
      savedCollections = collections.map((item) =>
        item.coverPhotoId === 'sample-1'
          ? { ...item, coverThumbnailUrl: samplePhotos[0].thumbnail }
          : item,
      );
      return route.fulfill({ status: 204 });
    }

    return savedCollections
      ? route.fulfill({ json: { collections: savedCollections } })
      : route.fallback();
  });
  const frame = await bounds(board(page));
  const first = await selectFirst(page);
  const start = await bounds(first);
  await drag(
    page,
    first.getByRole('button', { name: 'Select Along Superior' }),
    48,
    32,
  );
  await drag(page, first.locator('.resize-notch'), 60, 0);

  await first.getByRole('button', { name: 'Lake Superior · Oct 2025' }).click();
  const metadata = first.getByRole('textbox', { name: 'Collection metadata' });
  await metadata.fill('North Shore · Nov 2025');
  await metadata.press('Enter');

  await first.getByRole('button', { name: 'Choose cover photo' }).click();
  await page
    .getByRole('dialog', { name: 'Choose cover photo' })
    .getByRole('button', { name: 'Photo 1', exact: true })
    .click();

  await first
    .getByRole('button', { name: 'Along Superior', exact: true })
    .click();
  const title = first.getByRole('textbox', { name: 'Collection title' });
  await title.fill('Along the North Shore');
  await title.press('Enter');

  const request = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' &&
      new URL(request.url()).pathname === '/api/collections',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const payload = (await request).postDataJSON();
  expect(payload.collections).toHaveLength(sampleCollections.length);
  const edited = payload.collections.find(
    ({ id }: { id: string }) => id === 'along-superior',
  );
  expect(edited).toMatchObject({
    title: 'Along the North Shore',
    metadata: 'North Shore · Nov 2025',
    coverPhotoId: 'sample-1',
  });
  expect(edited).not.toHaveProperty('coverThumbnailUrl');
  expect(edited.x).toBeCloseTo((start.x - frame.x + 48) / frame.width, 3);
  expect(edited.y).toBeCloseTo((start.y - frame.y + 32) / frame.width, 3);
  expect(edited.width).toBeCloseTo((start.width + 60) / frame.width, 3);

  const saved = collection(page, 'Along the North Shore');
  await expect(
    saved.getByRole('heading', { name: 'Along the North Shore' }),
  ).toBeVisible();
  await expect(saved.getByText('North Shore · Nov 2025')).toBeVisible();
  await expect(saved.getByRole('link')).toBeVisible();
  await expect(saved.getByRole('img', { name: 'Collection cover' }))
    .toHaveAttribute('src', samplePhotos[0].thumbnail);

  const position = await bounds(saved);
  expect(position.x - start.x).toBeCloseTo(48, 0);
  expect(position.y - start.y).toBeCloseTo(32, 0);
  expect(position.width - start.width).toBeCloseTo(60, 0);
});

test('should keep edits open when saving fails', async ({ page }) => {
  await page.route('**/api/collections', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500 })
      : route.fallback(),
  );
  const first = await selectFirst(page);
  await first
    .getByRole('button', { name: 'Along Superior', exact: true })
    .click();
  const title = first.getByRole('textbox', { name: 'Collection title' });
  await title.fill('Unsaved title');
  await title.press('Enter');

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText('Could not save changes.');
  await expect(
    collection(page, 'Unsaved title').getByRole('button', {
      name: 'Delete collection',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled();
});

test('should hide editing controls on smaller screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await expect(
    collection(page, 'Along Superior').getByRole('link'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit collections' }),
  ).toHaveCount(0);
});

test('should show collections in one column on smaller screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await expect(
    page.getByRole('button', { name: 'Edit collections' }),
  ).toBeHidden();

  const items = await board(page).getByRole('article').all();
  expect(items.length).toBeGreaterThan(1);
  const boxes = await Promise.all(items.map(bounds));

  for (let index = 1; index < boxes.length; index++) {
    const previous = boxes[index - 1];
    const current = boxes[index];

    expect(current.x).toBeCloseTo(previous.x);
    expect(current.width).toBeCloseTo(previous.width);
    expect(current.y).toBeGreaterThanOrEqual(previous.y + previous.height);
  }

  expect(boxes[0].x).toBeGreaterThanOrEqual(0);
  expect(boxes[0].x + boxes[0].width).toBeLessThanOrEqual(390);
});

test('should sort collections by y position on smaller screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const titles = board(page).getByRole('heading', { level: 2 });

  await expect(titles).toHaveText([
    'Along Superior',
    'Freight Country',
    'Quiet Water',
    'After the Shift',
  ]);
});
