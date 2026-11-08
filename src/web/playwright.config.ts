import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser',
  outputDir: 'node_modules/.cache/playwright',
  use: { baseURL: 'http://127.0.0.1:5195', reducedMotion: 'reduce' },
  webServer: {
    command: 'bun run dev --host 127.0.0.1 --port 5195 --strictPort',
    url: 'http://127.0.0.1:5195',
  },
});
