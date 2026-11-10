import type { Page } from '@playwright/test';
import type { Collection } from '../data/Collection';
import { createPhotoApi, isPhotoRequest } from './photoApi';
import { sampleCollections } from './sampleCollections';

export async function mockApi(
  page: Page,
  {
    owner = false,
    collections = sampleCollections,
  }: {
    owner?: boolean;
    collections?: Collection[];
  } = {},
) {
  await page.route('**/api/session', (route) =>
    owner
      ? route.fulfill({ json: { owner: true } })
      : route.fulfill({ status: 401 }),
  );

  await page.route('**/api/collections', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { collections } })
      : route.fallback(),
  );
}

export async function mockPhotos(page: Page) {
  const api = createPhotoApi();
  await page.route((url) => isPhotoRequest(url.pathname), async (route) => {
    const request = route.request();
    const body = request.postDataBuffer();
    const response = await api.handle(new Request(request.url(), {
      method: request.method(),
      headers: request.headers(),
      body: body ? new Uint8Array(body) : undefined,
    }));
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  return api;
}
