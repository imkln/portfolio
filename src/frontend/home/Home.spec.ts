import { expect, test } from '@playwright/test';
import { mockApi } from '../testutils/fakeApi';
import { sampleCollections, sampleCoverPhoto } from '../testutils/sampleCollections';

test('can open a collection from its cover in view mode', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const collection = page.getByRole('article', { name: 'Along Superior' });
  await expect(collection.getByRole('img', { name: 'Collection cover' }))
    .toHaveAttribute('src', sampleCoverPhoto);

  await collection.getByRole('link').click();

  await expect(page).toHaveURL(/\/collections\/along-superior$/);
  const items = page.getByRole('region', { name: 'Collection canvas' });
  await expect(items.getByRole('img', { name: 'Collection cover' }))
    .toHaveAttribute('src', sampleCoverPhoto);
});

test('should load collections when opening Home', async ({ page }) => {
  await mockApi(page, {
    collections: [
      {
        id: 'saved-on-the-server',
        title: 'Saved on the server',
        metadata: 'A saved collection',
        coverPhotoId: null,
        x: 0,
        y: 0,
        width: 0.4,
      },
    ],
  });

  const listRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/collections') {
      listRequests.push(request.method());
    }
  });
  await page.goto('/collections/saved-on-the-server');
  await expect(page.getByRole('region', { name: 'Collection canvas' })).toBeVisible();
  expect(listRequests).toEqual([]);

  await page.getByRole('link', { name: 'Home' }).click();

  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Saved on the server' }),
  ).toBeVisible();
});

test('should show an empty board when there are no collections', async ({
  page,
}) => {
  await mockApi(page, { collections: [] });

  await page.goto('/');

  await expect(page.getByRole('region', { name: 'Collections' })).toContainText(
    'No collections yet',
  );
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('should show an error when collections cannot load', async ({ page }) => {
  await mockApi(page, { owner: true });
  await page.route('**/api/collections', (route) =>
    route.fulfill({ status: 500 }),
  );

  await page.goto('/');

  await expect(page.getByRole('alert')).toHaveText(
    'Could not load collections.',
  );
  await expect(
    page.getByRole('button', { name: 'Edit collections' }),
  ).toHaveCount(0);
});

test('should hide editing controls from non-owners', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await mockApi(page);

  await page.goto('/');

  await expect(
    page.getByRole('article', { name: 'Along Superior' }).getByRole('link'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: /Edit collections|Add collection|^Save$|Delete collection/,
    }),
  ).toHaveCount(0);
});
