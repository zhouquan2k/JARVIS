import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const knowledgeFixtureRoot = path.resolve(configDir, '../server/tests/fixtures/knowledge-workspace');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 15_000
  },
  fullyParallel: true,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: 'http://127.0.0.1:34174',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    {
      command: `PORT=8791 CHATPRISM_KNOWLEDGE_ROOT=${knowledgeFixtureRoot} pnpm --filter server dev`,
      port: 8791,
      reuseExistingServer: false
    },
    {
      command: 'VITE_E2E=1 VITE_CONTEXT_BASE_URL=http://127.0.0.1:8791/api/context VITE_SYNC_BASE_URL=http://127.0.0.1:8791/api/sync pnpm dev --host 127.0.0.1 --port 34174 --strictPort',
      port: 34174,
      reuseExistingServer: false
    }
  ]
});
