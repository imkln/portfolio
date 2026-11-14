import type { Page } from '@playwright/test';
import type { CanvasItem, Collection } from '../collections/CollectionTypes';
import { createFakeCollectionsApi, isCollectionRequest } from './fakeCollectionsApi';
import { createFakePhotosApi, isPhotoRequest } from './fakePhotosApi';
import { sampleCollections } from './sampleCollections';

export async function mockApi(
  page: Page,
  {
    owner = false,
    collections = sampleCollections,
    itemsByCollection = {},
  }: {
    owner?: boolean;
    collections?: Collection[];
    itemsByCollection?: Record<string, CanvasItem[]>;
  } = {},
) {
  await page.route('**/api/session', (route) =>
    owner
      ? route.fulfill({ json: { owner: true } })
      : route.fulfill({ status: 401 }),
  );

  const handleCollections = createFakeCollectionsApi(collections, itemsByCollection);
  await page.route((url) => isCollectionRequest(url.pathname), async (route) => {
    const request = route.request();
    if (request.method() !== 'GET' && !owner) {
      await route.fulfill({ status: 401 });
      return;
    }
    const response = await handleCollections(new Request(request.url(), {
      method: request.method(),
      body: request.postData() ?? undefined,
    }));
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
}

export async function mockPhotos(page: Page, ...fixtures: Parameters<typeof createFakePhotosApi>) {
  const api = createFakePhotosApi(...fixtures);
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
