import type { CanvasItem, Collection, CollectionDetail } from './CollectionTypes';

export async function fetchCollections(signal?: AbortSignal) {
  const response = await fetch('/api/collections', { signal });
  if (!response.ok) throw new Error('Could not load collections');

  const data: { collections: Collection[] } = await response.json();
  if (!Array.isArray(data.collections)) {
    throw new Error('Invalid collections response');
  }

  return data.collections;
}

export async function updateCollections(updated: Collection[]) {
  const changes = updated.map(({ coverPhotoUrl, ...collection }) => collection);
  const response = await fetch('/api/collections', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collections: changes }),
  });
  if (!response.ok) throw new Error('Could not save collections');
}

export async function fetchCollectionItems(id: string, signal: AbortSignal) {
  const response = await fetch(`/api/collections/${id}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Could not load collection');

  const collection: CollectionDetail = await response.json();
  if (!Array.isArray(collection.items)) throw new Error('Invalid collection response');
  return collection.items;
}

export async function updateCollectionItems(id: string, updated: CanvasItem[]) {
  const items = updated.map((item) => {
    if (item.kind === 'caption') return item;

    const { coverPhotoUrl, ...photo } = item;
    return photo;
  });

  const response = await fetch(`/api/collections/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) throw new Error('Could not save collection');
}
