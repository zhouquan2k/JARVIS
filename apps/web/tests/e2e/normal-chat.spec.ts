import { expect, test, type Page } from '@playwright/test';

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

async function readMockSyncEvents(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('chatprism:mock-sync-events') ?? '[]'));
}

test('normal chat can send message and recover local history after reload', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('normal-model')).toHaveValue('gemini-2.5-flash');

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

test('web host initializes sync storage with configured syncKey', async ({ page }) => {
  await page.addInitScript((syncKey: string) => {
    localStorage.setItem('chatprism:sync-key', syncKey);
    localStorage.setItem('chatprism:mock-sync-events', '[]');
  }, 'web-sync-e2e');

  await page.goto('/#/');
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
  await page.goto('/#/');
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('normal-model')).toHaveValue('gemini-2.5-flash');

  await page.getByTestId('normal-input').fill('WEB_LOCAL_ALPHA');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).toContainText('gemini-api/gemini-2.5-flash => WEB_LOCAL_ALPHA');

  await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('normal-input').fill('WEB_LOCAL_BETA');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).toContainText('gemini-api/gemini-2.5-flash => WEB_LOCAL_BETA');

  const localHistoryItems = page.getByTestId('local-history-item');
  await expect(localHistoryItems).toHaveCount(2);
  await localHistoryItems.nth(1).click();

  await expect(page.getByTestId('normal-messages')).toContainText('WEB_LOCAL_ALPHA');
  await expect(page.getByTestId('normal-messages')).toContainText('gemini-api/gemini-2.5-flash => WEB_LOCAL_ALPHA');
});

test('workspace sidebar persists while switching between normal and compare views', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('workspace-sidebar')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('normal-model')).toHaveValue('gemini-2.5-flash');

  await page.getByTestId('sidebar-new-chat-menu').click();
  await page.getByTestId('sidebar-new-chat-compare').click();
  await expect(page.getByTestId('compare-chat-view')).toBeVisible();
  await expect(page.getByTestId('workspace-sidebar')).toBeVisible();
  await expect(page.getByTestId('history-source-local')).toHaveCount(0);
  await expect(page.getByTestId('compare-model-a')).toHaveValue('gemini-2.5-flash');

  await page.getByTestId('sidebar-new-chat').click();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('workspace-sidebar')).toBeVisible();
});

test('normal chat renders markdown from assistant output', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('normal-model')).toHaveValue('gemini-2.5-flash');

  await page.getByTestId('normal-input').fill('TRIGGER_MARKDOWN_NATIVE');
  await page.getByTestId('normal-send').click();

  await expect(page.locator('.markdown-body h2').first()).toContainText('Markdown');
  await expect(page.getByTestId('normal-messages').locator('ul li').first()).toContainText('第一条要点');
  await expect(page.getByTestId('normal-messages').locator('pre code').first()).toContainText("console.log('markdown from model')");
});

test('provider selectors use runtime model catalogs instead of static defaults', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('normal-provider')).toHaveValue('gemini-api');
  await expect(page.getByTestId('normal-provider').locator('option:checked')).toHaveText('Gemini (API) (Mock)');
  await expect(page.getByTestId('normal-model')).toHaveValue('gemini-2.5-flash');
  await expect(page.getByTestId('normal-model').locator('option:checked')).toHaveText('Gemini 2.5 Flash');
  await expect(page.getByTestId('normal-model').locator('option')).toContainText(['Gemini 2.5 Flash', 'Gemini Pro Latest']);

  await page.getByTestId('sidebar-new-chat-menu').click();
  await page.getByTestId('sidebar-new-chat-compare').click();
  await expect(page.getByTestId('compare-chat-view')).toBeVisible();
  await expect(page.getByTestId('compare-model-a')).toHaveValue('gemini-2.5-flash');
  await expect(page.getByTestId('compare-model-b')).toHaveValue('gemini-2.5-flash');
});

test('normal and compare views stay bounded to the viewport', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expectViewportBound(page);

  await page.getByTestId('sidebar-new-chat-menu').click();
  await page.getByTestId('sidebar-new-chat-compare').click();
  await expect(page.getByTestId('compare-chat-view')).toBeVisible();
  await expectViewportBound(page);
});

test('normal chat supports attachment composition and structured annotations', async ({ page }) => {
  await page.goto('/#/');
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
