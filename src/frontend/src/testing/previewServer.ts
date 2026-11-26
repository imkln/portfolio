import type { Plugin } from 'vite';
import { createFakeCollectionsApi, isCollectionRequest } from './fakeCollectionsApi.ts';
import { previewCollections, previewItemsByCollection } from './previewCollections.ts';
import { previewPhotos } from './previewPhotos.ts';
import { createFakePhotosApi, isPhotoRequest } from './fakePhotosApi.ts';

export function previewServer(mode: string): Plugin {
  return {
    name: 'portfolio-preview',
    apply: 'serve',
    configureServer(server) {
      if (mode !== 'photos-preview' && mode !== 'collection-canvas-preview') return;

      const photos = createFakePhotosApi(
        previewPhotos.map((photo, index) => ({
          ...photo,
          tagIds: index % 3 === 0 ? ['paris', 'architecture'] : index % 3 === 1 ? ['nature'] : [],
        })),
        [
          { id: 'france', name: 'France' },
          { id: 'paris', name: 'Paris', parentId: 'france' },
          { id: 'architecture', name: 'Architecture' },
          { id: 'nature', name: 'Nature' },
        ],
      );
      const collections = mode === 'collection-canvas-preview' ? previewCollections : [];
      const handleCollections = createFakeCollectionsApi(collections, previewItemsByCollection);
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const collectionRequest = isCollectionRequest(url.pathname);
        if (collectionRequest || isPhotoRequest(url.pathname)) {
          async function sendPreviewResponse() {
            const headers = new Headers();
            for (const [name, value] of Object.entries(request.headers)) {
              if (typeof value === 'string') headers.set(name, value);
            }

            const chunks: Buffer[] = [];
            for await (const chunk of request) chunks.push(chunk);
            const body = chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined;
            const input = new Request(url, { method: request.method, headers, body });
            const result = collectionRequest
              ? await handleCollections(input)
              : await photos.handle(input);

            response.writeHead(result.status, Object.fromEntries(result.headers));
            response.end(Buffer.from(await result.arrayBuffer()));
          }

          void sendPreviewResponse().catch(next);
          return;
        }
        if (request.method !== 'GET' || url.pathname !== '/api/session') return next();

        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ owner: true }));
      });
    },
  };
}
