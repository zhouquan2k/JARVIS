import { expect, test, chromium, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EXTENSION_PATH = path.resolve(__dirname, '../../dist/chrome-mv3');

async function launchExtensionPage(
  options: {
    routeHash?: string;
    syncKey?: string | null;
  } = {}
): Promise<{
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}> {
  const routeHash = options.routeHash ?? '#/chat';
  const syncKey = options.syncKey === undefined ? 'extension-e2e' : options.syncKey;
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
  await page.evaluate((payload: { syncKey: string | null }) => {
    localStorage.removeItem('chatprism:sync-key');
    localStorage.setItem('chatprism:mock-sync-events', '[]');
    if (payload.syncKey !== null) {
      localStorage.setItem('chatprism:sync-key', payload.syncKey);
    }
  }, { syncKey });
  await page.reload();

  return {
    context,
    page,
    close: async () => {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  };
}

async function readMockSyncEvents(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('chatprism:mock-sync-events') ?? '[]'));
}

async function expectHostFontBaseline(page: Page) {
  const metrics = await page.evaluate(() => {
    const input = document.querySelector('[data-testid="normal-input"]') as HTMLTextAreaElement | null;
    return {
      bodyFontSize: getComputedStyle(document.body).fontSize,
      inputFontSize: input ? getComputedStyle(input).fontSize : null
    };
  });

  expect(metrics.bodyFontSize).toBe('15px');
  expect(metrics.inputFontSize).toBe('15px');
}

test('extension host supports external provider switching, Gemini preview/error fallback, and file import', async () => {
  const session = await launchExtensionPage();
  try {
    const { page } = session;
    await expect(page.getByTestId('conversation-workspace')).toBeVisible();

    await page.getByTestId('history-source-external').click();
    await expect(page.getByTestId('external-provider-chatgpt-web')).toBeVisible();
    await expect(page.getByTestId('external-provider-gemini-web')).toBeVisible();
    await expect(page.getByTestId('external-provider-external-file')).toBeVisible();
    await expect(page.getByTestId('external-history-item')).toHaveCount(2);

    await page.getByTestId('external-provider-gemini-web').click();
    await expect(page.getByTestId('external-history-item')).toHaveCount(2);
    await page.getByTestId('external-history-item').first().click();
    await expect(page.getByTestId('preview-import')).toBeVisible();
    await expect(page.getByTestId('normal-input')).toHaveCount(0);
    await expect(page.getByTestId('normal-messages')).toContainText('规则远程化');

    await page.getByTestId('preview-import').click();
    await expect(page.getByTestId('normal-input')).toBeVisible();
    await expect(page.getByTestId('local-history-item')).toHaveCount(1);
    await expect(page.getByTestId('normal-messages')).toContainText('规则远程化');
    await expect.poll(async () => {
      const events = await readMockSyncEvents(page);
      return events.filter((event: { type: string }) => event.type === 'push').length;
    }).toBe(1);
    const events = await readMockSyncEvents(page);
    const pushEvent = events.find((event: { type: string }) => event.type === 'push');
    expect(pushEvent.syncKey).toBe('extension-e2e');

    await page.getByTestId('history-source-external').click();
    await page.getByTestId('external-provider-gemini-web').click();
    await expect(page.getByTestId('history-imported-badge').first()).toBeVisible();
    await page.getByTestId('external-history-item').nth(1).click();
    await expect(page.getByTestId('normal-error')).toContainText('页面结构已变化');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByTestId('external-provider-external-file').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'external-history.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        title: 'Imported File Session',
        messages: [
          { id: 'file-u1', role: 'user', content: '从文件导入的用户问题' },
          { id: 'file-a1', role: 'assistant', content: '从文件导入的助手回答' }
        ]
      }))
    });

    await expect(page.getByTestId('normal-messages')).toContainText('从文件导入的助手回答');
    await expect(page.getByTestId('local-history-item')).toHaveCount(2);
    await expect.poll(async () => {
      const mockEvents = await readMockSyncEvents(page);
      return mockEvents.filter((event: { type: string }) => event.type === 'push').length;
    }).toBe(2);
  } finally {
    await session.close();
  }
});

test('extension host applies unified host font baseline', async () => {
  const session = await launchExtensionPage();
  try {
    const { page } = session;
    await expect(page.getByTestId('conversation-workspace')).toBeVisible();
    await expect(page.getByTestId('normal-input')).toBeVisible();
    await expectHostFontBaseline(page);
  } finally {
    await session.close();
  }
});

test('extension host exposes the knowledge workspace route with editable markdown documents and top-level workspace switching', async () => {
  const session = await launchExtensionPage({ routeHash: '#/' });
  try {
    const { page } = session;
    await expect(page.getByTestId('knowledge-workspace')).toBeVisible();
    await expect(page.getByTestId('knowledge-file-tree')).toBeVisible();
    await expect(page.getByTestId('knowledge-assistant-pane')).toBeVisible();
    await expect(page.getByTestId('normal-chat-view')).toBeVisible();

    const editor = page.getByTestId('knowledge-editor-input');
    await expect(editor).toBeVisible();
    await expect(editor).toContainText('扩展宿主');

    await page.getByTestId('knowledge-node-file').first().click();
    await editor.fill('Playwright extension knowledge');
    await page.getByTestId('knowledge-save').click();
    await expect.poll(async () => {
      return page.evaluate(() => localStorage.getItem('chatprism:extension-knowledge-workspace') ?? '');
    }).toContain('Playwright extension knowledge');

    await page.getByTestId('topbar-workspace-normal-chat').click();
    await expect(page.getByTestId('conversation-workspace')).toBeVisible();
    await expect(page.getByTestId('normal-chat-view')).toBeVisible();

    await page.getByTestId('topbar-workspace-knowledge-workspace').click();
    await expect(page.getByTestId('knowledge-workspace')).toBeVisible();
  } finally {
    await session.close();
  }
});

test('extension host keeps compare history local-only when sync is enabled', async () => {
  const session = await launchExtensionPage({ routeHash: '#/compare' });
  try {
    const { page } = session;
    await expect(page.getByTestId('compare-chat-view')).toBeVisible();

    await page.getByTestId('compare-input').fill('Extension compare stays local');
    await page.getByTestId('compare-send').click();
    await expect(page.getByTestId('analysis-grid')).toBeVisible();

    const events = await readMockSyncEvents(page);
    expect(events.filter((event: { type: string }) => event.type === 'push')).toHaveLength(0);
  } finally {
    await session.close();
  }
});

test('extension host rejects syncKey=0 outside development', async () => {
  const session = await launchExtensionPage({ syncKey: '0' });
  try {
    const { page } = session;
    await expect(page.getByTestId('normal-error')).toContainText('syncKey=0 仅允许在开发环境使用');
    await expect(page.getByTestId('normal-input')).toBeDisabled();
    const events = await readMockSyncEvents(page);
    expect(events.filter((event: { type: string }) => event.type === 'push')).toHaveLength(0);
  } finally {
    await session.close();
  }
});

test('extension host sends attachments through background proxy and renders structured annotations', async () => {
  const session = await launchExtensionPage();
  try {
    const { page } = session;
    await expect(page.getByTestId('normal-chat-view')).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'diagram.png',
      mimeType: 'image/png',
      buffer: Buffer.from([1, 2, 3, 4])
    });

    await expect(page.locator('.draft-chip')).toContainText('diagram.png');
    await page.getByTestId('normal-input').fill('TRIGGER_ANNOTATED_NATIVE');
    await page.getByTestId('normal-send').click();

    await expect(page.getByTestId('normal-messages')).toContainText('diagram.png');
    await expect(page.getByTestId('normal-messages')).toContainText('返回了结构化消息');
    await expect(page.locator('.inline-cite').first()).toContainText('[1]');
    await expect(page.locator('.inline-cite').first()).toHaveAttribute('href', 'https://example.com/mock-source');
    await expect(page.locator('.image-tile').first()).toBeVisible();
  } finally {
    await session.close();
  }
});

test('extension host e2e covers md pdf and image attachments through background proxy', async () => {
  const session = await launchExtensionPage();
  try {
    const { page } = session;
    await expect(page.getByTestId('normal-chat-view')).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles([
      {
        name: 'research.md',
        buffer: Buffer.from('# Research\n\nAttachment body')
      },
      {
        name: 'report.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 mock pdf')
      },
      {
        name: 'diagram.png',
        mimeType: 'image/png',
        buffer: Buffer.from([1, 2, 3, 4])
      }
    ]);

    const draftList = page.locator('.draft-list');
    await expect(draftList).toContainText('research.md');
    await expect(draftList).toContainText('report.pdf');
    await expect(draftList).toContainText('diagram.png');

    await page.getByTestId('normal-input').fill('TRIGGER_ATTACHMENT_ECHO');
    await page.getByTestId('normal-send').click();

    await expect(page.getByTestId('normal-messages')).toContainText('research.md');
    await expect(page.getByTestId('normal-messages')).toContainText('report.pdf');
    await expect(page.getByTestId('normal-messages')).toContainText('diagram.png');
    await expect(page.getByTestId('normal-messages')).toContainText('research.md [text/markdown]');
    await expect(page.getByTestId('normal-messages')).toContainText('report.pdf [application/pdf]');
    await expect(page.getByTestId('normal-messages')).toContainText('diagram.png [image/png]');
  } finally {
    await session.close();
  }
});
