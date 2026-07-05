import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const knowledgeFixtureRoot = path.resolve(configDir, '../server/tests/fixtures/knowledge-workspace');
const useRendererDist = process.env.WEB2_E2E_USE_RENDERER_DIST === '1';
const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || (useRendererDist
  ? 'http://127.0.0.1:8791'
  : 'http://127.0.0.1:34174');
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';
const e2eSyncKey = process.env.WEB2_E2E_SYNC_KEY?.trim() || 'web2-e2e';
const rendererDist = path.resolve(configDir, 'dist');

function createServerCommand(): string {
  const baseEnv = [
    'PORT=8791',
    `CHATPRISM_KNOWLEDGE_ROOT=${knowledgeFixtureRoot}`,
    `CHATPRISM_SYNC_KEY=${e2eSyncKey}`
  ];

  if (useRendererDist) {
    baseEnv.push(`CHATPRISM_RENDERER_DIST=${rendererDist}`);
  }

  return `${baseEnv.join(' ')} pnpm --filter server dev`;
}

function createWeb2Command(): string {
  return `VITE_E2E=1 VITE_SYNC_KEY=${e2eSyncKey} VITE_CONTEXT_BASE_URL=http://127.0.0.1:8791/api/context VITE_SYNC_BASE_URL=http://127.0.0.1:8791/api/sync pnpm dev --host 127.0.0.1 --port 34174 --strictPort`;
}

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
    baseURL,
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: skipWebServer
    ? undefined
    : (useRendererDist
        ? [
            {
              command: createServerCommand(),
              port: 8791,
              reuseExistingServer: false
            }
          ]
        : [
            {
              command: createServerCommand(),
              port: 8791,
              reuseExistingServer: false
            },
            {
              command: createWeb2Command(),
              port: 34174,
              reuseExistingServer: false
            }
          ])
});
