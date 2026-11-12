import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { createFakeCollectionsApi, isCollectionRequest } from './testutils/fakeCollectionsApi.ts';
import { previewCollections, previewCollectionItems } from './testutils/previewCollections.ts';
import { createFakePhotosApi, isPhotoRequest } from './testutils/fakePhotosApi.ts';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'photos-preview',
      apply: 'serve',
      configureServer(server) {
        if (mode !== 'photos-preview' && mode !== 'collection-canvas-preview') return;

        const photos = createFakePhotosApi();
        const collections = mode === 'collection-canvas-preview' ? previewCollections : [];
        const handleCollections = createFakeCollectionsApi(collections, { 'along-superior': previewCollectionItems });
        server.middlewares.use(async (request, response, next) => {
          const url = new URL(request.url ?? '/', 'http://localhost');
          const collectionRequest = isCollectionRequest(url.pathname);
          if (collectionRequest || isPhotoRequest(url.pathname)) {
            try {
              const headers = new Headers();
              for (const [name, value] of Object.entries(request.headers)) {
                if (typeof value === 'string') headers.set(name, value);
              }

              const chunks: Buffer[] = [];
              for await (const chunk of request) chunks.push(chunk);
              const body = chunks.length
                ? new Uint8Array(Buffer.concat(chunks))
                : undefined;
              const input = new Request(url, { method: request.method, headers, body });
              const result = collectionRequest
                ? await handleCollections(input)
                : await photos.handle(input);

              response.writeHead(result.status, Object.fromEntries(result.headers));
              response.end(Buffer.from(await result.arrayBuffer()));
            } catch (error) {
              next(error);
            }
            return;
          }
          if (request.method !== 'GET' || url.pathname !== '/api/session') return next();

          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ owner: true }));
        });
      },
    },
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/auth': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['**/*.test.tsx'],
    setupFiles: ['./test-setup.ts'],
  },
}));
