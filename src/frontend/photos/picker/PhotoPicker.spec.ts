import { expect, test } from '@playwright/test';
import { mockApi, mockPhotos } from '../../testutils/fakeApi';
import { samplePhotos } from '../../testutils/samplePhotos';

test('can choose a filtered photo', async ({ page }) => {
  await mockApi(page, { owner: true });
  await mockPhotos(page, [samplePhotos[0], { ...samplePhotos[1], tagIds: ['nature'] }], [
    { id: 'nature', name: 'Nature' },
  ]);
  await page.goto('/collections/along-superior');
  await page.getByRole('button', { name: 'Edit canvas' }).click();
  await page.getByRole('button', { name: 'Add photo' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose photo' });
  await picker.getByRole('button', { name: 'Filter by tags', exact: true }).click();
  await picker.getByRole('button', { name: 'Nature', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Photo 1', exact: true })).toHaveCount(0);

  await picker.getByRole('button', { name: 'Photo 2', exact: true }).click();

  await expect(picker).toBeHidden();
  await expect(page.getByRole('article', { name: 'Photo', exact: true }).last().getByRole('img'))
    .toHaveAttribute('src', '/api/photos/sample-2');
});
