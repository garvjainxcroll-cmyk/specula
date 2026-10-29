import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Use a browser already installed at this path when there is one (for example in a cloud
// container); otherwise Playwright's own (`npx playwright install chromium`).
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium';

// End-to-end test of the console in a real browser, against the local server with an
// in-memory store (nothing is written to disk).
export default defineConfig({
  testDir: 'e2e',
  timeout: 5 * 60 * 1000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:8898', trace: 'retain-on-failure', screenshot: 'only-on-failure', actionTimeout: 15000, viewport: { width: 1440, height: 900 },
    launchOptions: existsSync(LOCAL_CHROMIUM) ? { executablePath: LOCAL_CHROMIUM } : {} },
  webServer: {
    command: 'node scripts/dev-server.mjs 8898',
    url: 'http://localhost:8898/api/health',
    reuseExistingServer: false,
    env: { JACO_STORE: 'memory', JACO_FAST_HASH: '1', JACO_SETUP_CODE: 'e2e-setup-code' },
    timeout: 30000,
  },
});
