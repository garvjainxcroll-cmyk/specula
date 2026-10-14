import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 5 * 60 * 1000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:8898', trace: 'retain-on-failure', screenshot: 'only-on-failure', actionTimeout: 15000 },
  webServer: {
    command: 'node scripts/dev-server.mjs 8898',
    url: 'http://localhost:8898/api/health',
    reuseExistingServer: false,
    env: { MARKET_STORE: 'memory' },
    timeout: 30000,
  },
});
