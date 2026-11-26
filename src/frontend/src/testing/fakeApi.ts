import type { Page } from '@playwright/test';
import type { CanvasItem, Collection } from './apiTypes';
import type { createFakePhotosApi } from './fakePhotosApi';
import { sampleCollections } from './sampleCollections';

export type MockCollections = {
  owner: boolean;
  collections: Collection[];
  itemsByCollection: Record<string, CanvasItem[]>;
};

export type MockPhotos = { photos: Parameters<typeof createFakePhotosApi> };

export async function mockApi(
  page: Page,
  { owner = false, collections = sampleCollections, itemsByCollection = {} }: Partial<MockCollections> = {},
) {
  await seed(page, 'collections', { owner, collections, itemsByCollection });
}

export async function mockPhotos(page: Page, ...photos: MockPhotos['photos']) {
  await seed(page, 'photos', { photos });
}

async function seed(page: Page, fixture: string, data: MockCollections | MockPhotos) {
  const response = await page.request.post('/__fixtures/' + fixture, { data });
  if (!response.ok()) throw new Error(`Could not seed ${fixture}: ${response.status()}`);
}
