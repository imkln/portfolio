import type { CanvasItem, Collection } from '../data/Collection.ts';

export function createCollectionApi(
  collections: Collection[],
  initialItems: Record<string, CanvasItem[]> = {},
) {
  const saved = new Map(Object.entries(initialItems));
  const originals = new Map<string, string>();
  for (const item of Object.values(initialItems).flat()) {
    if (item.kind === 'photo' && item.coverPhotoId && item.coverPhotoUrl) {
      originals.set(item.coverPhotoId, item.coverPhotoUrl);
    }
  }

  return async (request: Request, id: string) => {
    const collection = collections.find((item) => item.id === id);
    if (!collection) return new Response(null, { status: 404 });

    if (request.method === 'PATCH') {
      const { items }: { items: CanvasItem[] } = await request.json();
      saved.set(id, items.map((item) => item.kind === 'photo'
        ? { ...item, coverPhotoUrl: originals.get(item.coverPhotoId ?? '') ?? `/api/photos/${item.coverPhotoId}` }
        : item));
      return new Response(null, { status: 204 });
    }

    const items = saved.get(id) ?? (collection.coverPhotoId ? [{
      id: 'cover',
      kind: 'photo',
      coverPhotoId: collection.coverPhotoId,
      coverPhotoUrl: collection.coverPhotoUrl,
      x: 0,
      y: 0,
      width: 0.53,
    }] : []);
    return Response.json({ ...collection, items });
  };
}
