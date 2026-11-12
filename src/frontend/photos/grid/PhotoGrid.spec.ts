import { expect, test } from '@playwright/test';
import { mockApi } from '../../testutils/fakeApi';

test('should tile portrait and landscape photos at their original aspect ratios', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await mockApi(page, { owner: true });
  const ids = ['portrait', 'landscape', 'coast', 'forest', 'shore'];
  await page.route('**/api/photos', (route) => route.fulfill({
    json: { photos: ids.map((id) => ({ id, name: id, uploadedAt: '2026-01-01' })) },
  }));
  await page.route('**/api/photos/*/thumbnail', (route) => {
    const portrait = route.request().url().endsWith('/portrait/thumbnail');
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${portrait ? 200 : 300}" height="${portrait ? 300 : 200}"/>`,
    });
  });

  await page.goto('/photos');
  const grid = page.getByRole('region', { name: 'Photos' });
  await expect(grid.getByRole('img')).toHaveCount(ids.length);

  await expect.poll(async () => {
    const boxes = await grid.getByRole('button').evaluateAll((tiles) =>
      tiles.map((tile) => {
        const { x, y, width, height } = tile.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    const [portrait, landscape, , , shore] = boxes;

    return {
      portraitRatio: Math.round(100 * portrait.width / portrait.height),
      landscapeRatio: Math.round(100 * landscape.width / landscape.height),
      equalWidths: portrait.width === landscape.width,
      stackedBelowLandscape: shore.x === landscape.x &&
        shore.y > landscape.y + landscape.height &&
        shore.y < portrait.y + portrait.height,
    };
  }).toEqual({
    portraitRatio: 67,
    landscapeRatio: 150,
    equalWidths: true,
    stackedBelowLandscape: true,
  });
});
