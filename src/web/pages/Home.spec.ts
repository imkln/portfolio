import { expect, test } from '@playwright/test';
import { mockApi } from '../testutils/fakeApi';
import { sampleCoverPhoto } from '../testutils/sampleCollections';

test('can open a collection from its cover in view mode', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const collection = page.getByRole('article', { name: 'Along Superior' });
  await expect(collection.getByRole('img', { name: 'Collection cover' }))
    .toHaveAttribute('src', sampleCoverPhoto);

  await collection.getByRole('link').click();

  await expect(page).toHaveURL(/\/collections\/along-superior$/);
  await expect(
    page.getByRole('heading', { name: 'Along Superior', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'Collection cover' }))
    .toHaveAttribute('src', sampleCoverPhoto);
});

test('should show collections returned by the API', async ({ page }) => {
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

  await page.goto('/');

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

test('should show sign-in when signed out', async ({ page }) => {
  await mockApi(page);

  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/auth/login',
  );
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('should hide editing controls from non-owners', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 850 });
  await mockApi(page);

  await page.goto('/');

  await expect(
    page.getByRole('article', { name: 'Along Superior' }).getByRole('link'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: /Edit collections|Add collection|^Save$|Delete collection/,
    }),
  ).toHaveCount(0);
});

test('can sign out when signed in', async ({ page }) => {
  await mockApi(page, { owner: true });
  await page.route('**/auth/logout', (route) =>
    route.fulfill({ status: 200, body: 'Signed out' }),
  );
  await page.goto('/');

  const logout = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/auth/logout',
  );
  await page.getByRole('button', { name: 'Sign out' }).click();

  expect((await logout).method()).toBe('POST');
});
