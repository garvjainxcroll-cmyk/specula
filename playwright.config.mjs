import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60 * 60 * 1000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:8899', trace: 'retain-on-failure', screenshot: 'only-on-failure', actionTimeout: 15000 },
  webServer: {
    command: 'node scripts/dev-server.mjs 8899',
    url: 'http://localhost:8899/api/health',
    reuseExistingServer: false,
    env: { SPECULA_STORE: 'memory' },
    timeout: 30000,
  },
});
