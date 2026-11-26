import { defineConfig } from '@playwright/test';

// Set PORTFOLIO_FRONTEND_URL to run these tests against a separately served build.
const replacement = process.env.PORTFOLIO_FRONTEND_URL;
const mockServer = 'http://127.0.0.1:5196';
const devServer = 'http://127.0.0.1:5195';

export default defineConfig({
  testDir: './e2e',
  outputDir: 'node_modules/.cache/playwright',
  use: { baseURL: replacement ? mockServer : devServer, reducedMotion: 'reduce' },
  webServer: [
    {
      command: 'bun mock-server.ts',
      url: mockServer + '/__fixtures/health',
      env: replacement ? { PORTFOLIO_FRONTEND_URL: replacement } : {},
    },
    ...(replacement ? [] : [{
      command: 'bun run dev --mode e2e --host 127.0.0.1 --port 5195 --strictPort',
      url: devServer,
    }]),
  ],
});
