import { expect, test } from '@playwright/test';

test('can open a collection from its cover in view mode', async ({ page }) => {
  await page.goto('/');

  const collection = page.getByRole('article', { name: 'Along Superior' });

  await collection.getByRole('link').locator('img').click();

  await expect(page).toHaveURL(/\/collections\/along-superior$/);
  await expect(
    page.getByRole('heading', { name: 'Along Superior', level: 1 }),
  ).toBeVisible();
});
