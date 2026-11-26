import { expect, type Locator } from '@playwright/test';

export async function expectPhoto(photo: Locator, expectedSource: string) {
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate(async (image: HTMLImageElement, source) => {
    if (!image.complete || image.naturalWidth === 0) return false;

    const expected = new Image();
    expected.src = source;
    await expected.decode();

    // Compare the fixture's image content at the same scale, regardless of its URL.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d')!;
    function pixels(photo: HTMLImageElement) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(photo, 0, 0, canvas.width, canvas.height);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    }
    const actual = pixels(image);
    return pixels(expected).every((value, index) => value === actual[index]);
  }, expectedSource)).toBe(true);
}
