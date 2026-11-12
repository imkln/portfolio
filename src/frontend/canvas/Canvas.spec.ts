import { expect, test, type Locator, type Page } from '@playwright/test';
import { sampleCollections, sampleCoverPhoto } from '../testutils/sampleCollections';
import { mockApi, mockPhotos } from '../testutils/fakeApi';

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

  const text = await bounds(collection(page, config.title).getByRole('heading'));
  expect((text.x - frame.x) / frame.width).toBeCloseTo(0.61, 3);
  expect((text.y - frame.y) / frame.width).toBeCloseTo(0.03, 3);
});

test('can drag collection text independently of its cover', async ({ page }) => {
  const first = await selectFirst(page);
  const cover = first.getByRole('img');
  const title = first.getByRole('button', { name: 'Along Superior', exact: true });
  const coverBefore = await bounds(cover);
  const titleBefore = await bounds(title);

  await drag(page, title, 80, 40);

  const titleAfter = await bounds(title);
  expect(titleAfter.x - titleBefore.x).toBeCloseTo(80, 0);
  expect(titleAfter.y - titleBefore.y).toBeCloseTo(40, 0);
  expect(await bounds(cover)).toEqual(coverBefore);
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
    .toHaveAttribute('src', '/api/photos/sample-1');
});

test('can close the cover picker without changing the cover', async ({ page }) => {
  await mockPhotos(page);
  const first = await selectFirst(page);
  const button = first.getByRole('button', { name: 'Choose cover photo' });
  const cover = first.getByRole('img', { name: 'Collection cover' });
  await expect(cover).toHaveAttribute('src', sampleCoverPhoto);
  await button.click();
  const picker = page.getByRole('dialog', { name: 'Choose cover photo' });
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(picker).toBeHidden();
  await expect(cover).toHaveAttribute('src', sampleCoverPhoto);
  await expect(button).toBeFocused();
});

test('can save a collection deletion', async ({ page }) => {
  const first = await selectFirst(page);
  await first.getByRole('button', { name: 'Delete collection' }).click();
  await expect(first).toHaveCount(0);
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Edit collections' })).toBeVisible();
  await page.reload();
  await expect(collection(page, 'Quiet Water')).toBeVisible();
  await expect(first).toHaveCount(0);
});

test('should save an edit and return to view mode', async ({ page }) => {
  const first = await selectFirst(page);

  await first.getByRole('button', { name: 'Along Superior', exact: true }).click();
  const title = first.getByRole('textbox', { name: 'Collection title' });
  await title.fill('Along the North Shore');
  await title.press('Enter');
  const save = page.waitForRequest((request) =>
    new URL(request.url()).pathname === '/api/collections' && request.method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Edit collections' })).toBeVisible();
  const { collections } = (await save).postDataJSON() as { collections: typeof sampleCollections };
  const edited = collections.find(({ id }) => id === 'along-superior');
  expect(edited).toMatchObject({ title: 'Along the North Shore' });
  expect(edited).not.toHaveProperty('coverPhotoUrl');
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
    collection(page, 'Along Superior').getByRole('link').first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit collections' }),
  ).toHaveCount(0);
});

test('should show collections in one column on smaller screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(board(page)).toHaveClass(/\bcompact\b/);

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

test('should show dark collection text on smaller screens when light text is saved', async ({ page }) => {
  const freight = collection(page, 'Freight Country');
  const title = freight.getByRole('heading');
  const metadata = freight.getByText('Upper Midwest · Aug 2025', { exact: true });

  await page.setViewportSize({ width: 390, height: 844 });

  await expect(title).toHaveCSS('color', 'rgb(41, 40, 36)');
  await expect(metadata).toHaveCSS('color', 'rgb(94, 91, 85)');
});
