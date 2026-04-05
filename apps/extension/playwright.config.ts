import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const knowledgeFixtureRoot = path.resolve(process.cwd(), '../server/tests/fixtures/knowledge-workspace');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: {
    timeout: 15_000
  },
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium'
      }
    }
  ],
  webServer: {
    command: `WXT_E2E=1 WXT_CONTEXT_BASE_URL=http://127.0.0.1:8789/api/context WXT_SYNC_BASE_URL=http://127.0.0.1:8789/api/sync pnpm build && PORT=8789 CHATPRISM_KNOWLEDGE_ROOT=${knowledgeFixtureRoot} pnpm --filter server dev`,
    port: 8789,
    reuseExistingServer: false
  }
});
