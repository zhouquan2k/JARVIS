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

async function openCompareMode(page: Page) {
  await page.getByTestId('mode-switch').click();
  await expect(page.getByTestId('compare-chat-view')).toBeVisible();
}

test('5.1 打开扩展入口后默认进入普通聊天视图', async () => {
  const session = await launchExtensionPage();
  try {
    await expect(session.page.getByTestId('normal-chat-view')).toBeVisible();
  } finally {
    await session.close();
  }
});

test('5.2 支持普通/对比模式切换且 A/B 选择器独立联动', async () => {
  const session = await launchExtensionPage();
  try {
    const { page } = session;
    await expect(page.getByTestId('normal-chat-view')).toBeVisible();
    await openCompareMode(page);

    const providerA = page.getByTestId('compare-provider-a');
    const providerB = page.getByTestId('compare-provider-b');
    const modelB = page.getByTestId('compare-model-b');

    await providerB.selectOption('gemini-api');
    const modelBBefore = await modelB.inputValue();

    await providerA.selectOption('mock-second');
    await expect(providerB).toHaveValue('gemini-api');
    await expect(modelB).toHaveValue(modelBBefore);
  } finally {
    await session.close();
  }
});

test('5.3 对比流程支持 A/B 并发输出并自动切换分析网格', async () => {
  const session = await launchExtensionPage('#/compare');
  try {
    const { page } = session;
    await expect(page.getByTestId('compare-chat-view')).toBeVisible();
    await page.getByTestId('compare-input').fill('TRIGGER_MD_ARRAY_ANALYSIS');
    await page.getByTestId('compare-send').click();

    await expect(page.locator('[data-testid="tab-analysis"].active')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('analysis-grid')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="analysis-grid"] .panel')).toHaveCount(5);
  } finally {
    await session.close();
  }
});

test('5.4 中止仅影响当前流程，分析失败可降级并切回原生输出', async () => {
  const session = await launchExtensionPage('#/compare');
  try {
    const { page } = session;
    await expect(page.getByTestId('compare-chat-view')).toBeVisible();

    await page.getByTestId('compare-input').fill('TRIGGER_SLOW_STREAM');
    await page.getByTestId('compare-send').click();
    await expect(page.getByTestId('compare-stop')).toBeVisible();
    await page.getByTestId('compare-stop').click();
    await page.reload();
    if (await page.getByTestId('normal-chat-view').isVisible()) {
      await page.getByTestId('mode-switch').click();
    }
    await expect(page.getByTestId('compare-chat-view')).toBeVisible();

    await page.getByTestId('compare-input').fill('TRIGGER_BAD_ANALYSIS');
    await page.getByTestId('compare-send').click();
    await page.getByTestId('tab-analysis').click();
    await expect(page.getByTestId('analysis-error')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('tab-native').click();
    await expect(page.getByTestId('output-a')).toContainText('TRIGGER_BAD_ANALYSIS');
  } finally {
    await session.close();
  }
});

test('5.5 对比结果可落盘并在刷新后恢复', async () => {
  const session = await launchExtensionPage('#/compare');
  try {
    const { page } = session;
    await page.getByTestId('compare-input').fill('PERSIST_COMPARE_PROMPT');
    await page.getByTestId('compare-send').click();
    await expect(page.getByTestId('analysis-grid')).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => {
        return page.evaluate(() => localStorage.getItem('chatprism:last-compare-snapshot'));
      })
      .not.toBeNull();

    await page.reload();
    if (await page.getByTestId('normal-chat-view').isVisible()) {
      await page.getByTestId('mode-switch').click();
    }
    await expect(page.getByTestId('compare-chat-view')).toBeVisible();
    await page.getByTestId('tab-native').click();
    await expect(page.getByTestId('output-a')).toContainText('PERSIST_COMPARE_PROMPT');
  } finally {
    await session.close();
  }
});
