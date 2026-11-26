import { expect, test } from '@playwright/test';
import { mockApi, mockPhotos } from '../../src/testing/fakeApi';

test('should show sign-in when signed out', async ({ page }) => {
  await mockApi(page);

  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/login');
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('can sign out when signed in', async ({ page }) => {
  await mockApi(page, { owner: true });
  await page.goto('/');

  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Photos' })).toHaveCount(0);
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
