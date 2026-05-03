import { expect, test, type Page } from '@playwright/test';

const sendShortcut = process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter';

async function expectViewportBound(page: Page) {
  const metrics = await page.evaluate(() => {
    const appShell = document.querySelector('.app-shell') as HTMLElement | null;
    const workspace = document.querySelector('[data-testid="conversation-workspace"]') as HTMLElement | null;
    return {
      viewportHeight: window.innerHeight,
      scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
      appShellHeight: appShell?.getBoundingClientRect().height ?? 0,
      workspaceHeight: workspace?.getBoundingClientRect().height ?? 0
    };
  });

  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.appShellHeight).toBeGreaterThanOrEqual(metrics.viewportHeight - 1);
  expect(metrics.workspaceHeight).toBeGreaterThan(0);
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

async function readMockSyncEvents(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('chatprism:mock-sync-events') ?? '[]'));
}

test('normal chat can send message and recover local history after reload', async ({ page }) => {
  await page.goto('/#/chat');
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('normal-model')).toHaveValue('gemini-pro-latest');

  const input = page.getByTestId('normal-input');
  const sendButton = page.getByTestId('normal-send');
  const prompt = 'Playwright normal flow message';

  await input.fill(prompt);
  await sendButton.click();

  await expect(page.getByTestId('normal-messages')).toContainText(prompt);
  await expect(page.getByTestId('normal-messages')).toContainText('gemini-api/');
  await expect(page.getByTestId('local-history-item')).toHaveCount(1);
  await expect(page.getByTestId('local-history-item').first()).toContainText('Playwright normal flow message');

  await page.reload();
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('local-history-item').first()).toBeVisible();
  await expect(page.getByTestId('local-history-item').first()).toContainText('Playwright normal flow message');
});

test('workspace locale toggle persists after refresh', async ({ page }) => {
  await page.goto('/#/chat');
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('topbar-locale-toggle')).toHaveText('EN');
  await expect(page.getByTestId('topbar-workspace-knowledge-workspace')).toHaveText('Workspace');

  await page.getByTestId('topbar-locale-toggle').dispatchEvent('click');
  await expect(page.getByTestId('topbar-locale-toggle')).toHaveText('中文');
  await expect(page.getByTestId('topbar-workspace-knowledge-workspace')).toHaveText('工作区');
  await expect(page.getByTestId('topbar-workspace-normal-chat')).toHaveText('对话');

  await page.reload();
  await expect(page.getByTestId('topbar-locale-toggle')).toHaveText('中文');
  await expect(page.getByTestId('topbar-workspace-knowledge-workspace')).toHaveText('工作区');
  await expect(page.getByTestId('topbar-workspace-normal-chat')).toHaveText('对话');
});

test('normal chat model options render switch persist and recover with the conversation', async ({ page }) => {
  await page.goto('/#/chat');
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('model-option-toggle-group')).toBeVisible();

  const deepResearchToggle = page.getByTestId('model-option-deep_research');
  await deepResearchToggle.click();
  await expect(deepResearchToggle).toHaveClass(/active/);

  await page.getByTestId('normal-model').selectOption({ label: 'Gemini Pro Latest' });
  await expect(page.getByTestId('model-option-toggle-group')).toBeVisible();

  await page.getByTestId('normal-model').selectOption({ label: 'Gemini 2.5 Flash' });
  await expect(page.getByTestId('model-option-toggle-group')).toBeVisible();
  await expect(deepResearchToggle).toHaveClass(/active/);

  await deepResearchToggle.click();
  await expect(deepResearchToggle).not.toHaveClass(/active/);

  await page.getByTestId('normal-input').fill('MODEL_OPTION_RECOVERY');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).toContainText('MODEL_OPTION_RECOVERY');
  await expect(page.getByTestId('local-history-item')).toHaveCount(1);

  await page.reload();
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await page.getByTestId('local-history-item').first().click();
  await expect(page.getByTestId('model-option-toggle-group')).toBeVisible();
  await expect(page.getByTestId('model-option-deep_research')).not.toHaveClass(/active/);
});

test('web host initializes sync storage with configured syncKey', async ({ page }) => {
  await page.addInitScript((syncKey: string) => {
    localStorage.setItem('chatprism:sync-key', syncKey);
    localStorage.setItem('chatprism:mock-sync-events', '[]');
  }, 'web-sync-e2e');

  await page.goto('/#/chat');
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();

  await page.getByTestId('normal-input').fill('WEB_SYNC_READY');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).toContainText('WEB_SYNC_READY');

  await expect.poll(async () => {
    const events = await readMockSyncEvents(page);
    return events.filter((event: { type: string }) => event.type === 'push').length;
  }).toBe(1);

  const events = await readMockSyncEvents(page);
  const pushEvent = events.find((event: { type: string }) => event.type === 'push');
  expect(pushEvent.syncKey).toBe('web-sync-e2e');
  expect(pushEvent.conversations).toHaveLength(1);
  expect(pushEvent.conversations[0].compare).toBeUndefined();
});

test('local history supports switching between conversations from sidebar', async ({ page }) => {
  await page.goto('/#/chat');
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('normal-model')).toHaveValue('gemini-pro-latest');

  await page.getByTestId('normal-input').fill('WEB_LOCAL_ALPHA');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).toContainText('gemini-api/gemini-pro-latest => WEB_LOCAL_ALPHA');

  await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('normal-input').fill('WEB_LOCAL_BETA');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).toContainText('gemini-api/gemini-pro-latest => WEB_LOCAL_BETA');

  const localHistoryItems = page.getByTestId('local-history-item');
  await expect(localHistoryItems).toHaveCount(2);
  await localHistoryItems.nth(1).click();

  await expect(page.getByTestId('normal-messages')).toContainText('WEB_LOCAL_ALPHA');
  await expect(page.getByTestId('normal-messages')).toContainText('gemini-api/gemini-pro-latest => WEB_LOCAL_ALPHA');
});

test('normal chat can bind a local conversation to an agent and surface it in the knowledge workspace agent lists', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('chatprism:mock-sync-events', '[]');
  });

  await page.goto('/#/chat');
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();

  const prompt = 'BIND_TO_AGENT_E2E';
  await page.getByTestId('normal-input').fill(prompt);
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('local-history-item')).toHaveCount(1);
  await expect(page.getByTestId('local-history-item').first()).toContainText(prompt);

  const localHistoryRow = page.locator('.local-history-row').first();
  await localHistoryRow.hover();
  await localHistoryRow.getByTestId('local-history-actions-menu').click({ force: true });
  await localHistoryRow.getByTestId('local-history-agent-binding').click({ force: true });
  const docsAgentOption = localHistoryRow.locator('[data-testid="local-history-agent-option"][data-agent-key="/docs/"]');
  await expect(docsAgentOption).toBeVisible();
  await docsAgentOption.click();

  await page.getByTestId('topbar-workspace-knowledge-workspace').click();
  await expect(page.getByTestId('document-workspace')).toBeVisible();

  await page.locator('[data-path="/docs"]').click();
  await expect(page.getByTestId('agent-view')).toBeVisible();
  await expect(page.getByTestId('agent-view-conversation')).toHaveCount(0);
  await expect(page.getByTestId('agent-document-conversation-item')).toContainText(prompt);
});

test('local history deletes the active conversation with hover-only controls and falls back cleanly', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('chatprism:mock-sync-events', '[]');
  });

  await page.goto('/#/chat');
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();

  await page.getByTestId('normal-input').fill('HISTORY_DELETE_ALPHA');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).toContainText('HISTORY_DELETE_ALPHA');
  await expect(page.getByTestId('local-history-item')).toHaveCount(1);

  await page.getByTestId('sidebar-new-chat').click();
  await expect(page.getByTestId('normal-messages')).not.toContainText('HISTORY_DELETE_ALPHA');
  await page.getByTestId('normal-input').fill('HISTORY_DELETE_BETA');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).toContainText('HISTORY_DELETE_BETA');

  const localHistoryItems = page.getByTestId('local-history-item');
  await expect(localHistoryItems).toHaveCount(2);

  const historyRows = page.locator('.local-history-row');
  const activeRow = historyRows.first();
  const inactiveRow = historyRows.nth(1);
  await inactiveRow.hover();
  await inactiveRow.getByTestId('local-history-actions-menu').click({ force: true });
  await expect(inactiveRow.getByTestId('local-history-actions-popup')).toBeVisible();
  await expect(inactiveRow.getByTestId('local-history-delete')).toBeVisible();

  await activeRow.hover();
  await activeRow.getByTestId('local-history-actions-menu').click({ force: true });
  await expect(activeRow.getByTestId('local-history-actions-popup')).toBeVisible();
  await activeRow.getByTestId('local-history-delete').click({ force: true });
  await activeRow.getByTestId('local-history-delete-confirm').click();

  await expect(localHistoryItems).toHaveCount(1);
  await expect(page.getByTestId('normal-messages')).toContainText('HISTORY_DELETE_ALPHA');
  await expect(page.getByTestId('normal-messages')).not.toContainText('HISTORY_DELETE_BETA');

  await expect.poll(async () => {
    const events = await readMockSyncEvents(page);
    return events.some((event: { type: string; deletedConversations?: Array<unknown> }) =>
      event.type === 'push' && Array.isArray(event.deletedConversations) && event.deletedConversations.length > 0);
  }).toBe(true);
});

test('workspace sidebar persists while switching between normal and compare views', async ({ page }) => {
  await page.goto('/#/chat');
  await expect(page.getByTestId('workspace-sidebar')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('normal-model')).toHaveValue('gemini-pro-latest');

  await page.getByTestId('sidebar-new-chat-menu').click();
  await page.getByTestId('sidebar-new-chat-compare').click();
  await expect(page.getByTestId('compare-chat-view')).toBeVisible();
  await expect(page.getByTestId('workspace-sidebar')).toBeVisible();
  await expect(page.getByTestId('history-source-local')).toHaveCount(0);
  await expect(page.getByTestId('compare-model-a')).toHaveValue('gemini-pro-latest');

  await page.getByTestId('sidebar-new-chat').click();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('workspace-sidebar')).toBeVisible();
});

test('normal chat renders markdown from assistant output', async ({ page }) => {
  await page.goto('/#/chat');
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('normal-model')).toHaveValue('gemini-pro-latest');

  await page.getByTestId('normal-input').fill('TRIGGER_MARKDOWN_NATIVE');
  await page.getByTestId('normal-send').click();

  await expect(page.locator('.markdown-body h2').first()).toContainText('Markdown');
  await expect(page.getByTestId('normal-messages').locator('ul li').first()).toContainText('第一条要点');
  await expect(page.getByTestId('normal-messages').locator('pre code').first()).toContainText("console.log('markdown from model')");
});

test('provider selectors use runtime model catalogs instead of static defaults', async ({ page }) => {
  await page.goto('/#/chat');
  await expect(page.getByTestId('normal-provider')).toHaveValue('gemini-api');
  await expect(page.getByTestId('normal-provider').locator('option:checked')).toHaveText('Gemini (API) (Mock)');
  await expect(page.getByTestId('normal-model')).toHaveValue('gemini-pro-latest');
  await expect(page.getByTestId('normal-model').locator('option:checked')).toHaveText('Gemini Pro Latest');
  await expect(page.getByTestId('normal-model').locator('option')).toContainText(['Gemini 2.5 Flash', 'Gemini Pro Latest']);

  await page.getByTestId('sidebar-new-chat-menu').click();
  await page.getByTestId('sidebar-new-chat-compare').click();
  await expect(page.getByTestId('compare-chat-view')).toBeVisible();
  await expect(page.getByTestId('compare-model-a')).toHaveValue('gemini-pro-latest');
  await expect(page.getByTestId('compare-model-b')).toHaveValue('gemini-pro-latest');
});

test('normal and compare views stay bounded to the viewport', async ({ page }) => {
  await page.goto('/#/chat');
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expectViewportBound(page);

  await page.getByTestId('sidebar-new-chat-menu').click();
  await page.getByTestId('sidebar-new-chat-compare').click();
  await expect(page.getByTestId('compare-chat-view')).toBeVisible();
  await expectViewportBound(page);
});

test('web host applies unified host font baseline', async ({ page }) => {
  await page.goto('/#/chat');
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('normal-input')).toBeVisible();
  await expectHostFontBaseline(page);
});

test('normal chat supports attachment composition and structured annotations', async ({ page }) => {
  await page.goto('/#/chat');
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
});

test('normal chat e2e covers md pdf and image attachments', async ({ page }) => {
  await page.goto('/#/chat');
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
});

test('normal chat uses composition shortcuts and restores draft after stop', async ({ page }) => {
  await page.goto('/#/chat');
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();

  const input = page.getByTestId('normal-input');
  await input.fill('第一行');
  await input.press('Enter');
  await expect(input).toHaveValue('第一行\n');
  await expect(page.getByTestId('local-history-item')).toHaveCount(0);

  await input.type('第二行');
  await input.press(sendShortcut);
  await expect(page.getByTestId('normal-messages')).toContainText('第一行');
  await expect(page.getByTestId('local-history-item')).toHaveCount(1);

  await input.fill('TRIGGER_SLOW_STREAM abort prompt');
  await input.press(sendShortcut);
  await expect(page.getByTestId('normal-stop')).toBeVisible();
  await page.getByTestId('normal-stop').click();

  await expect(input).toHaveValue('TRIGGER_SLOW_STREAM abort prompt');
});

test('question index panel supports compact controls, reopen, starring, filtering and soft delete', async ({ page }) => {
  await page.goto('/#/chat');
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();

  const input = page.getByTestId('normal-input');
  await input.fill('索引问题一\n补充内容');
  await input.press(sendShortcut);
  await expect(page.getByTestId('question-index-panel')).toBeVisible();

  await input.fill('索引问题二');
  await input.press(sendShortcut);

  const questionItems = page.getByTestId('question-item');
  await expect(questionItems).toHaveCount(2);
  await expect(questionItems.first()).toContainText('索引问题一');
  await expect(questionItems.nth(1)).toContainText('索引问题二');
  await expect(page.getByTestId('question-panel-close')).toBeVisible();

  let firstRow = questionItems.first();
  await expect(firstRow.getByTestId('question-star')).toBeHidden();
  await expect(firstRow.getByTestId('question-delete')).toBeHidden();
  await firstRow.hover();
  await expect(firstRow.getByTestId('question-star')).toBeVisible();
  await expect(firstRow.getByTestId('question-delete')).toBeVisible();
  await firstRow.getByTestId('question-star').click();
  await expect(page.locator('.question-starred').first()).toBeVisible();

  await page.getByTestId('question-panel-close').click();
  await expect(page.getByTestId('question-index-panel')).toBeHidden();
  await expect(page.getByTestId('question-panel-open')).toBeVisible();
  await page.getByTestId('question-panel-open').click();
  await expect(page.getByTestId('question-index-panel')).toBeVisible();

  await page.getByTestId('question-filter-starred').click();
  await expect(questionItems).toHaveCount(1);
  await expect(questionItems.first()).toContainText('索引问题一');

  firstRow = questionItems.first();
  await firstRow.hover();
  await firstRow.getByTestId('question-delete').click();
  await firstRow.getByTestId('question-delete-confirm').click();

  await expect(page.getByTestId('question-index-empty')).toContainText('No starred questions.');
  await expect(page.locator('.message.user .user-content')).toHaveCount(1);
  await expect(page.locator('.message.user .user-content').first()).toContainText('索引问题二');
});
