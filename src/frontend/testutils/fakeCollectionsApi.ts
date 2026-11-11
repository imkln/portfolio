import type { CanvasItem, Collection } from '../collections/CollectionTypes.ts';

const collectionsPath = '/api/collections';

export function isCollectionRequest(path: string) {
  return path === collectionsPath || /^\/api\/collections\/[^/]+$/.test(path);
}

export function createFakeCollectionsApi(
  initialCollections: Collection[],
  initialItems: Record<string, CanvasItem[]> = {},
) {
  let collections = initialCollections;
  const saved = new Map(Object.entries(initialItems));
  const originals = new Map<string, string | undefined>();
  for (const { coverPhotoId, coverPhotoUrl } of collections) {
    if (coverPhotoId) originals.set(coverPhotoId, coverPhotoUrl);
  }
  for (const item of Object.values(initialItems).flat()) {
    if (item.kind === 'photo' && item.coverPhotoId && item.coverPhotoUrl) {
      originals.set(item.coverPhotoId, item.coverPhotoUrl);
    }
  }

  return async (request: Request) => {
    const { pathname } = new URL(request.url);
    if (pathname === collectionsPath) {
      if (request.method === 'PUT') {
        const body: { collections: Collection[] } = await request.json();
        collections = body.collections.map((collection) => {
          const { coverPhotoId } = collection;
          if (!coverPhotoId || originals.has(coverPhotoId)) {
            return { ...collection, coverPhotoUrl: coverPhotoId ? originals.get(coverPhotoId) : undefined };
          }
          return { ...collection, coverPhotoUrl: `/api/photos/${encodeURIComponent(coverPhotoId)}` };
        });
        const retained = new Set(collections.map(({ id }) => id));
        for (const id of saved.keys()) {
          if (!retained.has(id)) saved.delete(id);
        }
        return new Response(null, { status: 204 });
      }

      return Response.json({ collections });
    }

    const id = pathname.slice(collectionsPath.length + 1);
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
