import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { previewServer } from './src/testing/previewServer.ts';

export default defineConfig(({ mode }) => {
  const mock = mode === 'e2e';
  const api = mock ? 'http://127.0.0.1:5196' : 'http://localhost:8080';

  return {
    plugins: [react(), previewServer(mode)],
    server: {
      proxy: {
        '/api': api,
        '/auth': api,
        ...(mock && { '/__fixtures': api, '/test-photo-uploads': api }),
      },
    },
  };
});
