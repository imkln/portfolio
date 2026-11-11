import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { createCollectionApi } from './testutils/collectionApi.ts';
import { sampleCollections, sampleCollectionItems } from './testutils/sampleCollections.ts';
import { createPhotoApi, isPhotoRequest } from './testutils/photoApi.ts';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'photos-preview',
      apply: 'serve',
      configureServer(server) {
        if (mode !== 'photos-preview' && mode !== 'collection-canvas-preview') return;

        const photos = createPhotoApi();
        const collections = mode === 'collection-canvas-preview' ? sampleCollections : [];
        const detail = createCollectionApi(collections, { 'along-superior': sampleCollectionItems });
        server.middlewares.use(async (request, response, next) => {
          const url = new URL(request.url ?? '/', 'http://localhost');
          const collectionID = /^\/api\/collections\/([a-z0-9-]+)$/.exec(url.pathname)?.[1];
          if (collectionID || isPhotoRequest(url.pathname)) {
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
              const result = collectionID
                ? await detail(input, collectionID)
                : await photos.handle(input);

              response.writeHead(result.status, Object.fromEntries(result.headers));
              response.end(Buffer.from(await result.arrayBuffer()));
            } catch (error) {
              next(error);
            }
            return;
          }
          if (request.method !== 'GET') return next();

          const data =
            url.pathname === '/api/session'
              ? { owner: true }
              : url.pathname === '/api/collections'
                ? { collections }
                : undefined;
          if (!data) return next();

          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify(data));
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
