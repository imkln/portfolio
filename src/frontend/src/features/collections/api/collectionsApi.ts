import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CanvasItem, Collection, CollectionDetail } from '../types/CollectionTypes';

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


const collectionsKey = ['collections'] as const;
const collectionItemsKey = (id: string) => ['collection-items', id] as const;

export function useCollections() {
  return useQuery({
    queryKey: collectionsKey,
    queryFn: ({ signal }) => fetchCollections(signal),
  });
}

export function useSaveCollections() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (items: Collection[]) => {
      await updateCollections(items);
      try {
        client.setQueryData(collectionsKey, await fetchCollections());
      } catch {
        client.setQueryData(collectionsKey, items);
      }
    },
  });
}

export function useCollectionItems(id: string) {
  return useQuery({
    queryKey: collectionItemsKey(id),
    queryFn: ({ signal }) => fetchCollectionItems(id, signal),
  });
}

export function useSaveCollectionItems(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (items: CanvasItem[]) => updateCollectionItems(id, items),
    onSuccess: (_, items) => { client.setQueryData(collectionItemsKey(id), items); },
  });
}
