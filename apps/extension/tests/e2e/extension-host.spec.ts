import { expect, test, chromium, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EXTENSION_PATH = path.resolve(__dirname, '../../dist/chrome-mv3');

async function launchExtensionPage(routeHash = '#/'): Promise<{
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatprism-ext-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`
    ]
  });

  const serviceWorker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const extensionId = serviceWorker.url().split('/')[2];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html${routeHash}`);

  return {
    context,
    page,
    close: async () => {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  };
}

test('extension host supports external history preview and import flow', async () => {
  const session = await launchExtensionPage();
  try {
    const { page } = session;
    await expect(page.getByTestId('conversation-workspace')).toBeVisible();

    await page.getByTestId('history-source-external').click();
    await expect(page.getByTestId('external-history-item')).toHaveCount(2);
    await page.getByTestId('external-history-item').first().click();

    await expect(page.getByTestId('preview-import')).toBeVisible();
    await expect(page.getByTestId('normal-input')).toHaveCount(0);
    await expect(page.getByTestId('normal-messages')).toContainText('Alpha 项目的主要风险包括');

    await page.getByTestId('preview-import').click();
    await expect(page.getByTestId('normal-input')).toBeVisible();
    await expect(page.getByTestId('local-history-item')).toHaveCount(1);
    await expect(page.getByTestId('normal-messages')).toContainText('Alpha 项目的主要风险包括');

    await page.getByTestId('history-source-external').click();
    await expect(page.getByTestId('history-imported-badge').first()).toBeVisible();
  } finally {
    await session.close();
  }
});
