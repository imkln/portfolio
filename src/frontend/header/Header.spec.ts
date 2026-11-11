import { expect, test } from '@playwright/test';
import { mockApi, mockPhotos } from '../testutils/fakeApi';

test('should show sign-in when signed out', async ({ page }) => {
  await mockApi(page);

  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/auth/login',
  );
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
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

test('can open Photos from the header', async ({ page }) => {
  await mockApi(page, { owner: true });
  await mockPhotos(page);
  await page.goto('/');

  const navigation = page.getByRole('banner').getByRole('navigation');
  await expect(navigation.getByRole('link', { name: 'Home' })).toBeVisible();
  await navigation.getByRole('link', { name: 'Photos' }).click();

  await expect(page).toHaveURL(/\/photos$/);
  await expect(page.getByRole('region', { name: 'Photos' })).toBeVisible();
});

test('should hide Photos from non-owners', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Photos' })).toHaveCount(0);
});
