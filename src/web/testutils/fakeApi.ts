import type { Page } from '@playwright/test';
import type { Collection } from '../data/Collection';
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
