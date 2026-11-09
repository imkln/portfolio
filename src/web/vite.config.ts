import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'photos-preview',
      apply: 'serve',
      configureServer(server) {
        if (mode !== 'photos-preview') return;

        server.middlewares.use((request, response, next) => {
          if (request.method !== 'GET') return next();

          const data =
            request.url === '/api/session'
              ? { owner: true }
              : request.url === '/api/collections'
                ? { collections: [] }
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
