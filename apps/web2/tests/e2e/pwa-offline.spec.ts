import { expect, test } from '@playwright/test';

test('web2 offline shell restores recent document, task replica, and local conversation after one online visit', async ({ page }) => {
  const seedTime = Date.now();
  const offlineTaskTitle = `PWA offline task ${seedTime}`;
  const offlinePrompt = `PWA offline prompt ${seedTime}`;

  await page.goto('/#/');
  await expect(page.getByTestId('document-workspace')).toBeVisible();

  await page.locator('[data-testid="document-node-file"][data-path="/guide.md"]').click();
  await expect(page.getByTestId('document-editor')).toBeVisible();
  await expect(page.getByText('Default Knowledge Agent / guide')).toBeVisible();
  await expect(page.getByTestId('document-editor')).toContainText('Playwright knowledge web');

  await page.getByTestId('agent-task-add').click();
  await page.getByTestId('task-editor-title').fill(offlineTaskTitle);
  await page.getByTestId('task-editor-save').click({ force: true });
  await expect(page.getByTestId('agent-task-open-list')).toContainText(offlineTaskTitle);

  await page.getByTestId('topbar-workspace-normal-chat').click();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await page.getByTestId('normal-input').fill(offlinePrompt);
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-chat-view')).toContainText(offlinePrompt);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.evaluate(() => Boolean(navigator.serviceWorker?.controller))).toBe(true);
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();

  await page.context().setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toContainText(offlinePrompt);

  await page.getByTestId('workspace-restore').click();
  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await page.locator('[data-testid="document-node-file"][data-path="/guide.md"]').click();

  await expect(page.getByText('Default Knowledge Agent / guide')).toBeVisible();
  await expect(page.getByTestId('document-editor')).toContainText('Playwright knowledge web');
  await page.getByTestId('workspace-right-pane-tab-tasks').click();
  await expect(page.getByTestId('agent-task-open-list')).toContainText(offlineTaskTitle);
  await expect(page.getByTestId('document-readonly-banner')).toBeVisible();
  await expect(page.getByTestId('document-save')).toBeDisabled();
});
