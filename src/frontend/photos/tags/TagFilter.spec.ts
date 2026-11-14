import { expect, test, type Page } from '@playwright/test';
import { mockApi, mockPhotos } from '../../testutils/fakeApi';
import { samplePhotos } from '../../testutils/samplePhotos';

const france = { id: 'france', name: 'France' };
const paris = { id: 'paris', name: 'Paris', parentId: france.id };
const nature = { id: 'nature', name: 'Nature' };

async function openPhotos(page: Page, assignments: string[][]) {
  await mockApi(page, { owner: true });
  await mockPhotos(page, assignments.map((tagIds, index) => ({ ...samplePhotos[index], tagIds })), [france, paris, nature]);
  await page.goto('/photos');
  await page.getByRole('button', { name: 'Filter by tags', exact: true }).click();
}

function button(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

test('can apply a filter', async ({ page }) => {
  await openPhotos(page, [['paris'], ['nature']]);
  await button(page, 'Show subtags of France').click();

  await button(page, 'France › Paris').click();

  await expect(button(page, 'Photo 1')).toBeVisible();
  await expect(button(page, 'Photo 2')).toHaveCount(0);
});

test('can remove a filter', async ({ page }) => {
  await openPhotos(page, [['paris', 'nature'], ['nature'], ['paris']]);
  await button(page, 'France').click();
  await button(page, 'Nature').click();
  await expect(page.getByRole('button', { name: 'Filter by tags, 2 active' })).toBeVisible();

  await button(page, 'France').click();

  await expect(button(page, 'Nature')).toHaveAttribute('aria-pressed', 'true');
  await expect(button(page, 'Photo 2')).toBeVisible();
  await expect(button(page, 'Photo 3')).toHaveCount(0);
});

test('can clear filters', async ({ page }) => {
  await openPhotos(page, [['paris'], ['nature']]);
  await button(page, 'France').click();
  await button(page, 'Filter by tags, 1 active').click();

  await button(page, 'Clear all').click();

  await expect(button(page, 'Filter by tags')).toHaveAttribute('aria-expanded', 'false');
  await expect(button(page, 'Photo 2')).toBeVisible();
});

test('can load more filtered photos', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPhotos(page, Array.from({ length: 26 }, (_, index) => index === 1 ? ['nature'] : ['paris']));
  await button(page, 'France').click();
  await button(page, 'Filter by tags, 1 active').click();
  await expect(button(page, 'Photo 2')).toHaveCount(0);
  await expect(button(page, 'Photo 26')).toHaveCount(0);

  const next = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === '/api/photos' && url.searchParams.has('pageToken');
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  expect(new URL((await next).url()).searchParams.getAll('tagId')).toEqual(['france']);
  await expect(button(page, 'Photo 26')).toBeVisible();
});
