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

test('should display an empty cover at a 3:2 aspect ratio', async ({ page }) => {
  await mockApi(page, {
    collections: [{ ...sampleCollections[0], coverPhotoId: null, coverPhotoUrl: undefined }],
  });
  await page.goto('/');

  const placeholder = page.getByText('No cover photo', { exact: true });
  await expect(placeholder).toBeVisible();

  const ratio = await placeholder.evaluate((element) => {
    const { width, height } = element.getBoundingClientRect();
    return width / height;
  });

  expect(ratio).toBeCloseTo(3 / 2, 2);
});

for (const { shape, width, height } of [
  { shape: 'portrait', width: 200, height: 300 },
  { shape: 'square', width: 300, height: 300 },
  { shape: 'wide', width: 400, height: 200 },
]) {
  test(`should display a ${shape} cover at its original aspect ratio`, async ({ page }) => {
    const cover = sampleCollections[0];
    const image = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" /></svg>`;
    await mockApi(page, {
      collections: [{ ...cover, coverPhotoUrl: `data:image/svg+xml,${encodeURIComponent(image)}` }],
    });

    for (const path of ['/', `/collections/${cover.id}`]) {
      await page.goto(path);
      const ratios = await page.getByRole('img', { name: 'Collection cover' })
        .evaluate(async (image: HTMLImageElement) => {
          await image.decode();
          const bounds = image.getBoundingClientRect();
          return {
            rendered: bounds.width / bounds.height,
            original: image.naturalWidth / image.naturalHeight,
          };
        });

      expect(ratios.rendered).toBeCloseTo(ratios.original, 2);
    }
  });
}

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
