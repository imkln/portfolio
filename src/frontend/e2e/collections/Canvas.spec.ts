import { samplePhotos } from '../../src/testing/samplePhotos';
import { expectPhoto } from '../../src/testing/expectPhoto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { sampleCoverPhoto } from '../../src/testing/sampleCollections';
import { mockApi, mockPhotos } from '../../src/testing/fakeApi';

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
  await expect(page.getByRole('button', { name: 'Edit collections' })).toBeVisible();
});

test('can save a new text position without moving the cover', async ({ page }) => {
  const first = await selectFirst(page);
  const cover = first.getByRole('img');
  const title = first.getByRole('button', { name: 'Along Superior', exact: true });
  const coverBefore = await bounds(cover);
  const titleBefore = await bounds(title);

  await drag(page, title, 80, 40);

  const titleAfter = await bounds(title);
  expect(titleAfter.x).toBeGreaterThan(titleBefore.x);
  expect(titleAfter.y).toBeGreaterThan(titleBefore.y);
  expect(await bounds(cover)).toEqual(coverBefore);
  const frame = await bounds(board(page));
  const savedX = titleAfter.x - frame.x;
  const savedY = titleAfter.y - frame.y;

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit collections' })).toBeVisible();
  await page.reload();

  const reopened = await bounds(collection(page, 'Along Superior').getByRole('heading'));
  const reopenedFrame = await bounds(board(page));
  expect(reopened.x - reopenedFrame.x).toBeCloseTo(savedX, 0);
  expect(reopened.y - reopenedFrame.y).toBeCloseTo(savedY, 0);
});

test('can resize a selected collection', async ({ page }) => {
  const first = await selectFirst(page);
  const cover = first.getByRole('button', { name: 'Select Along Superior' });
  const start = await bounds(cover);

  await drag(page, first.getByTitle('Resize collection'), 60, 0);

  const resized = await bounds(cover);
  expect(resized.width).toBeGreaterThan(start.width);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit collections' })).toBeVisible();
  await page.reload();

  const saved = await bounds(collection(page, 'Along Superior'));
  expect(saved.width).toBeGreaterThan(start.width);
});

test('can select a collection with the keyboard', async ({ page }) => {
  const edit = page.getByRole('button', { name: 'Edit collections' });
  const first = collection(page, 'Along Superior');
  await edit.focus();

  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(first.getByRole('button', { name: 'Select Along Superior' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(first.getByRole('button', { name: 'Delete collection' })).toBeVisible();
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

test('should leave arrow keys available when editing text', async ({ page }) => {
  const first = await selectFirst(page);
  const start = await bounds(first);
  const startFrame = await bounds(board(page));
  await first.getByRole('button', { name: 'Along Superior', exact: true }).click();
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
  await expect(added.getByText('Add metadata')).toBeVisible();
  await expect(added.getByRole('img')).toHaveCount(0);
  await expect(board(page).getByRole('article').last()).toHaveAccessibleName('Untitled collection');
  await expect(added).toBeInViewport({ ratio: 0.9 });
  await expect(added.getByRole('button', { name: 'Delete collection' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test('selecting another collection moves the editing controls', async ({ page }) => {
  const first = await selectFirst(page);
  const second = collection(page, 'Quiet Water');
  await expect(first.getByRole('button', { name: 'Delete collection' })).toBeVisible();

  await second.getByRole('button', { name: 'Quiet Water', exact: true }).click();

  await expect(second.getByRole('button', { name: 'Delete collection' })).toBeVisible();
  await expect(first.getByRole('button', { name: 'Delete collection' })).toHaveCount(0);
});

test('can change and restore collection text settings', async ({ page }) => {
  const first = await selectFirst(page);
  for (const name of ['Large title', 'Light text']) {
    const setting = first.getByRole('button', { name });
    await setting.click();
    await expect(setting).toHaveAttribute('aria-pressed', 'true');
    await setting.click();
    await expect(setting).toHaveAttribute('aria-pressed', 'false');
  }
});

test('can choose a collection cover', async ({ page }) => {
  await mockPhotos(page);
  const first = await selectFirst(page);

  await first.getByRole('button', { name: 'Choose cover photo' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose cover photo' });
  await picker.getByRole('button', { name: 'Photo 1', exact: true }).click();

  await expect(picker).toBeHidden();
  await expectPhoto(first.getByRole('img', { name: 'Collection cover' }), samplePhotos[0].original);
});

test('can close the cover picker without changing the cover', async ({ page }) => {
  await mockPhotos(page);
  const first = await selectFirst(page);
  const button = first.getByRole('button', { name: 'Choose cover photo' });
  const cover = first.getByRole('img', { name: 'Collection cover' });
  await expectPhoto(cover, sampleCoverPhoto);
  await button.click();
  const picker = page.getByRole('dialog', { name: 'Choose cover photo' });
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(picker).toBeHidden();
  await expectPhoto(cover, sampleCoverPhoto);
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
  const edited = collection(page, 'Along the North Shore');
  await edited.getByRole('button', { name: 'Lake Superior · Oct 2025' }).click();
  const metadata = edited.getByRole('textbox', { name: 'Collection metadata' });
  await metadata.fill('North Shore / Nov 2025');
  await metadata.press('Enter');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Edit collections' })).toBeVisible();
  await page.reload();
  await expect(collection(page, 'Along the North Shore')).toContainText('North Shore / Nov 2025');
  await expect(collection(page, 'Along Superior')).toHaveCount(0);
});

test('should keep edits open when saving fails', async ({ page }) => {
  await page.route('**/api/collections', (route) =>
    route.request().method() === 'PUT' ? route.fulfill({ status: 500 }) : route.fallback(),
  );
  const first = await selectFirst(page);
  await first.getByRole('button', { name: 'Along Superior', exact: true }).click();
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
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
});

test('should hide editing controls on smaller screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await expect(collection(page, 'Along Superior').getByRole('link').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit collections' })).toHaveCount(0);
});

test('should sort collections by y position on smaller screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const titles = board(page).getByRole('heading', { level: 2 });

  await expect(titles).toHaveText([
    'Along Superior',
    'Freight Country',
    'Quiet Water',
    'After the Shift',
  ]);
});
