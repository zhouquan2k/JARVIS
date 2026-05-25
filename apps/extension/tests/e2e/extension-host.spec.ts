import { expect, test, chromium, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EXTENSION_PATH = path.resolve(__dirname, '../../dist/chrome-mv3');
const knowledgeFixtureRoot = path.resolve(process.cwd(), '../server/tests/fixtures/knowledge-workspace');

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

async function installCodexAuthMocks(page: Page) {
  await page.evaluate(() => {
    (window as typeof window & { __chatprismOpenCalls?: string[] }).__chatprismOpenCalls = [];
    window.open = ((url?: string | URL | undefined) => {
      const calls = (window as typeof window & { __chatprismOpenCalls?: string[] }).__chatprismOpenCalls ?? [];
      calls.push(String(url ?? ''));
      (window as typeof window & { __chatprismOpenCalls?: string[] }).__chatprismOpenCalls = calls;
      return null;
    }) as typeof window.open;
  });

  await page.addInitScript(() => {
    (window as typeof window & { __chatprismOpenCalls?: string[] }).__chatprismOpenCalls = [];
    window.open = ((url?: string | URL | undefined) => {
      const calls = (window as typeof window & { __chatprismOpenCalls?: string[] }).__chatprismOpenCalls ?? [];
      calls.push(String(url ?? ''));
      (window as typeof window & { __chatprismOpenCalls?: string[] }).__chatprismOpenCalls = calls;
      return null;
    }) as typeof window.open;
  });

  await page.route('**/api/codex/auth/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: false,
        providerId: 'chatgpt-codex',
        message: 'Not logged in'
      })
    });
  });

  await page.route('**/api/codex/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'device-auth',
        verificationUri: 'https://chatgpt.com/auth/device',
        message: 'Device auth started'
      })
    });
  });
}

async function readOpenCalls(page: Page) {
  return page.evaluate(() => (window as typeof window & { __chatprismOpenCalls?: string[] }).__chatprismOpenCalls ?? []);
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

async function selectNormalChatProvider(page: Page, providerId: string) {
  await page.getByTestId('normal-provider').selectOption(providerId);
  await expect(page.getByTestId('normal-provider')).toHaveValue(providerId);
  await expect.poll(async () => page.getByTestId('normal-model').inputValue()).not.toBe('');
}

async function selectCompareProviders(page: Page, providerAId: string, providerBId: string) {
  await page.getByTestId('compare-provider-a').selectOption(providerAId);
  await expect(page.getByTestId('compare-provider-a')).toHaveValue(providerAId);
  await expect.poll(async () => page.getByTestId('compare-model-a').inputValue()).not.toBe('');

  await page.getByTestId('compare-provider-b').selectOption(providerBId);
  await expect(page.getByTestId('compare-provider-b')).toHaveValue(providerBId);
  await expect.poll(async () => page.getByTestId('compare-model-b').inputValue()).not.toBe('');
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
    await expect(page.getByTestId('external-history-search')).toBeVisible();

    const searchInput = page.getByTestId('external-history-search-input');
    await searchInput.fill('incident');
    await page.getByTestId('external-history-search-submit').click();

    await expect(page.getByTestId('external-history-item')).toHaveCount(1);
    await expect(page.getByTestId('external-history-item').first()).toContainText('Beta Planning Session');

    await page.getByTestId('external-provider-gemini-web').click();
    await expect(searchInput).toHaveValue('incident');
    await expect(page.getByTestId('external-history-item')).toHaveCount(2);
    await expect(page.getByTestId('external-history-item').first()).toContainText('Gemini Sprint Review');
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
    await page.getByTestId('external-history-search-clear').click();
    await expect(searchInput).toHaveValue('');
    await expect(page.getByTestId('external-history-item')).toHaveCount(2);
    await expect(page.getByTestId('history-imported-badge').first()).toBeVisible();
    await page.getByTestId('external-history-item').nth(1).click();
    await expect(page.getByTestId('normal-error')).toContainText('Gemini page structure has changed');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByTestId('external-provider-external-file').click();
    await expect(page.getByTestId('external-history-search')).toHaveCount(0);
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

test('extension host restores imported external history from local persistence after reload', async () => {
  const session = await launchExtensionPage();
  try {
    const { page } = session;
    await expect(page.getByTestId('conversation-workspace')).toBeVisible();

    await page.getByTestId('history-source-external').click();
    await page.getByTestId('external-provider-gemini-web').click();
    await expect(page.getByTestId('external-history-item')).toHaveCount(2);
    await page.getByTestId('external-history-item').first().click();
    await expect(page.getByTestId('preview-import')).toBeVisible();
    await expect(page.getByTestId('normal-messages')).toContainText('规则远程化');

    await page.getByTestId('preview-import').click();
    await expect(page.getByTestId('local-history-item')).toHaveCount(1);
    await expect(page.getByTestId('local-history-item').first()).toContainText('Gemini Sprint Review');

    await page.reload();
    await expect(page.getByTestId('conversation-workspace')).toBeVisible();
    await expect(page.getByTestId('local-history-item')).toHaveCount(1);
    await expect(page.getByTestId('local-history-item').first()).toContainText('Gemini Sprint Review');
    await page.getByTestId('local-history-item').first().click();
    await expect(page.getByTestId('normal-messages')).toContainText('规则远程化');
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

test('extension host shows codex auth recovery and keeps chatgpt-codex selectable', async () => {
  const session = await launchExtensionPage();
  try {
    const { page } = session;
    await installCodexAuthMocks(page);

    await expect(page.getByTestId('conversation-workspace')).toBeVisible();
    await selectNormalChatProvider(page, 'chatgpt-web');
    await page.getByTestId('normal-provider').selectOption('chatgpt-codex');
    await expect(page.getByTestId('normal-provider')).toHaveValue('chatgpt-codex');
    await expect(page.getByTestId('normal-auth-warning')).toContainText('Codex provider');
    await expect(page.getByTestId('normal-auth-recovery')).toContainText('Codex');

    await page.getByTestId('normal-auth-recovery').click();
    await expect.poll(async () => readOpenCalls(page)).toContain('https://chatgpt.com/auth/device');
    await expect(page.getByTestId('normal-provider')).toHaveValue('chatgpt-codex');
  } finally {
    await session.close();
  }
});

test('extension host persists the first successful local conversation in history', async () => {
  const session = await launchExtensionPage();
  try {
    const { page } = session;
    await expect(page.getByTestId('conversation-workspace')).toBeVisible();

    await page.getByTestId('sidebar-new-chat').click();
    await page.getByTestId('normal-input').fill('请帮我梳理 extension 侧标题生成链路');
    await page.getByTestId('normal-send').click();

    await expect(page.getByTestId('normal-messages')).toContainText('请帮我梳理 extension 侧标题生成链路');
    await expect(page.getByTestId('local-history-item')).toHaveCount(1);
    await expect(page.getByTestId('local-history-item').first()).toBeVisible();
  } finally {
    await session.close();
  }
});

async function openConversationTab(page: import('@playwright/test').Page) {
  await page.getByTestId('agent-right-pane-tab-conversations').click();
  await expect(page.getByTestId('agent-conversation-panel')).toBeVisible();
}

test('extension host exposes the knowledge workspace route with editable markdown documents and top-level workspace switching', async () => {
  const session = await launchExtensionPage({ routeHash: '#/' });
  try {
    const { page } = session;
    await expect(page.getByTestId('document-workspace')).toBeVisible();
    await expect(page.getByTestId('document-file-tree')).toBeVisible();
    await expect(page.getByTestId('agent-right-pane')).toBeVisible();
    await expect(page.getByTestId('agent-view')).toContainText('Default Knowledge Agent');
    await expect(page.getByTestId('agent-view-scope')).toContainText('/');
    await expect(page.getByTestId('document-node-root')).toHaveClass(/active/);
    await expect(page.getByTestId('document-editor')).toHaveCount(0);

    await page.locator('[data-path="/guide.md"]').click();
    const editor = page.getByTestId('document-editor-input');
    await expect(editor).toBeVisible();
    await editor.fill('Playwright extension knowledge');
    await expect(editor).toContainText('Playwright extension knowledge');
    await page.getByTestId('document-save').click();

    await page.getByTestId('topbar-workspace-normal-chat').click();
    await expect(page.getByTestId('conversation-workspace')).toBeVisible();
    await expect(page.getByTestId('normal-chat-view')).toBeVisible();

    await page.getByTestId('topbar-workspace-knowledge-workspace').click();
    await expect(page.getByTestId('document-workspace')).toBeVisible();
  } finally {
    await session.close();
  }
});

test('extension knowledge workspace renders agent metadata', async () => {
  const session = await launchExtensionPage({ routeHash: '#/' });
  try {
    const { page } = session;
    await expect(page.getByTestId('document-workspace')).toBeVisible();
    await expect(page.getByTestId('agent-view')).toContainText('Default Knowledge Agent');
    await expect(page.getByTestId('agent-view-scope')).toContainText('/');
    await expect(page.getByTestId('agent-view-model')).toContainText('gemini-api / Gemini Pro Latest');
    await expect(page.getByTestId('agent-right-pane')).toBeVisible();
  } finally {
    await session.close();
  }
});

test('extension knowledge workspace negotiates text pdf and unsupported document requests', async () => {
  const session = await launchExtensionPage({ routeHash: '#/' });
  try {
    const { page } = session;
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.getByTestId('document-node-file').filter({ hasText: 'notes.txt' }).click();
    await expect(page.getByTestId('document-editor-surface')).toBeVisible();
    await expect(page.getByTestId('document-save')).toBeEnabled();

    await page.getByTestId('document-node-file').filter({ hasText: 'report.pdf' }).click();
    await openConversationTab(page);
    await expect(page.getByTestId('document-pdf-viewer')).toBeVisible();
    await expect(page.getByTestId('document-save')).toBeDisabled();

    await page.getByTestId('agent-conversation-list-plus').click();
    await expect(page.getByTestId('normal-input')).toBeVisible();
    await page.getByTestId('normal-input').fill('TRIGGER_ATTACHMENT_ECHO');
    await page.getByTestId('normal-send').click();
    await expect(page.getByTestId('normal-messages')).toContainText('report.pdf [application/pdf]');
    await expect(page.locator('.message.user .attachment-card')).toHaveCount(1);
    await expect(page.locator('.message.user').first()).toContainText('report.pdf');

    await page.getByTestId('normal-input').fill('第二轮继续问');
    await page.getByTestId('normal-send').click();
    await expect(page.locator('.message.user .attachment-card')).toHaveCount(1);
    await expect(page.locator('.message.user').last()).not.toContainText('report.pdf');

    await page.getByTestId('document-node-file').filter({ hasText: 'archive.bin' }).click();
    await openConversationTab(page);
    await expect(page.getByTestId('document-unsupported-viewer')).toContainText('application/octet-stream');

    await page.getByTestId('agent-conversation-list-plus').click();
    await expect(page.getByTestId('normal-input')).toBeVisible();
    await page.getByTestId('normal-input').fill('TRIGGER_ATTACHMENT_ECHO');
    await page.getByTestId('normal-send').click();
    await expect(page.getByTestId('normal-messages')).not.toContainText('archive.bin [application/octet-stream]');
  } finally {
    await session.close();
  }
});

test('extension knowledge workspace shows AgentView for owner directories and right-pane conversations', async () => {
  const session = await launchExtensionPage({ routeHash: '#/' });
  try {
    const { page } = session;
    const docsNode = page.locator('[data-path="/docs"]');

    await expect(page.getByTestId('document-workspace')).toBeVisible();
    await expect(docsNode).toBeVisible();
    await expect(docsNode.getByTestId('document-node-agent-owner')).toBeVisible();

    await docsNode.click();
    await expect(page.getByTestId('agent-view')).toBeVisible();
    await expect(page.getByTestId('agent-view-scope')).toContainText('/docs');
    await expect(page.getByTestId('agent-view')).toContainText('Docs Agent');
    await expect(page.getByTestId('agent-view-document')).toHaveCount(0);
    await openConversationTab(page);

    await page.getByTestId('agent-conversation-list-plus').click();
    await expect(page.getByTestId('normal-input')).toBeVisible();
    await page.getByTestId('normal-input').fill('Extension docs owner');
    await page.getByTestId('normal-send').click();
    await page.getByTestId('agent-conversation-back').click();
    await expect(page.getByTestId('agent-view-conversation')).toHaveCount(0);
    await expect(page.getByTestId('agent-document-conversation-item')).toContainText('Extension docs owner');

    await docsNode.locator('.tree-toggle').click();
    await page.locator('[data-path="/docs/overview.md"]').click();
    await expect(page.getByTestId('document-editor-input')).toBeVisible();
    await expect(page.getByTestId('agent-view')).toHaveCount(0);

    await docsNode.click();
    await expect(page.getByTestId('agent-view')).toBeVisible();
    await openConversationTab(page);
    await page.getByTestId('agent-document-conversation-item').click();
    await expect(page.getByTestId('normal-messages')).toContainText('Extension docs owner');

    await page.locator('[data-path="/guide.md"]').click();
    await expect(page.getByTestId('agent-view')).toHaveCount(0);
  } finally {
    await session.close();
  }
});

test('extension knowledge workspace inserts conversation links and reopens the requested conversation', async () => {
  const baseName = `extension-conversation-link-${Date.now()}`;
  const virtualPath = `/${baseName}.md`;
  const diskPath = path.join(knowledgeFixtureRoot, `${baseName}.md`);
  fs.writeFileSync(diskPath, 'Hello notes', 'utf8');
  const session = await launchExtensionPage({ routeHash: '#/' });
  try {
    const { page } = session;

    await expect(page.getByTestId('document-workspace')).toBeVisible();
    await page.locator(`[data-path="${virtualPath}"]`).click();
    await expect(page.getByTestId('document-editor-input')).toBeVisible();
    await openConversationTab(page);

    await page.getByTestId('agent-conversation-list-plus').click();
    await expect(page.getByTestId('normal-input')).toBeVisible();
    await page.getByTestId('normal-input').fill('Extension conversation link target');
    await page.getByTestId('normal-send').click();
    await expect(page.getByTestId('agent-conversation-title')).toContainText('Extension conversation link ta');
    await page.getByTestId('agent-conversation-back').click();
    await expect(page.getByTestId('agent-document-conversation-item')).toContainText('Extension conversation link ta');

    await page.locator('[data-testid="document-editor-surface"] .ProseMirror p').evaluate(() => {
      const paragraph = document.querySelector('[data-testid="document-editor-surface"] .ProseMirror p');
      const textNode = paragraph?.firstChild;
      if (!textNode) {
        return;
      }

      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(textNode, 6);
      range.setEnd(textNode, 11);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.getByTestId('markdown-insert-conversation-link').click();
    await page.locator('[data-testid^="markdown-conversation-link-option-"]').first().click();
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('link', { name: 'notes' }).click();

    await expect(page.getByTestId('agent-conversation-title')).toContainText('Extension conversation link ta');
    await expect(page.locator(`[data-path="${virtualPath}"]`)).toHaveClass(/active/);
  } finally {
    await session.close();
    fs.rmSync(diskPath, { force: true });
  }
});

test('extension host keeps compare history local-only when sync is enabled', async () => {
  const session = await launchExtensionPage({ routeHash: '#/compare' });
  try {
    const { page } = session;
    await expect(page.getByTestId('compare-chat-view')).toBeVisible();
    await selectCompareProviders(page, 'chatgpt-web', 'chatgpt-web');

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
    await expect(page.getByTestId('normal-error')).toContainText('syncKey=0 is only allowed in development');
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
    await selectNormalChatProvider(page, 'chatgpt-web');

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
    await selectNormalChatProvider(page, 'chatgpt-web');

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
