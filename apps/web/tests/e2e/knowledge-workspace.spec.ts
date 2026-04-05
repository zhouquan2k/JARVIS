import { expect, test } from '@playwright/test';

test('web knowledge workspace supports file browsing markdown editing diff undo redo and top-level workspace switching', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await expect(page.getByTestId('document-file-tree')).toBeVisible();
  await expect(page.getByTestId('document-editor')).toBeVisible();
  await expect(page.getByTestId('agent-pane')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('agent-name')).toContainText('Default Knowledge Agent（/）');
  await expect(page.getByTestId('document-node-root')).toHaveClass(/active/);
  await expect(page.getByTestId('document-editor-empty')).toBeVisible();

  await page.getByTestId('document-node-file').filter({ hasText: 'guide.md' }).click();
  const editor = page.getByTestId('document-editor-input');
  await expect(editor).toBeVisible();
  await editor.fill('Playwright knowledge web');
  await page.getByTestId('document-save').click();

  await page.getByTestId('normal-input').fill('TRIGGER_AGENT_REPLACE_ACTIVE_FILE');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).toContainText('updated by agent');
  await expect(page.getByTestId('document-file-change')).toBeVisible();
  await expect(page.getByTestId('document-file-diff')).toContainText('Playwright knowledge web updated by agent');

  await page.getByTestId('document-file-change-undo').click();
  await expect(page.getByTestId('document-file-change-redo')).toBeEnabled();
  await expect(page.getByTestId('document-file-diff')).toContainText('Playwright knowledge web');

  await page.getByTestId('document-file-change-redo').click();
  await expect(page.getByTestId('document-file-diff')).toContainText('updated by agent');

  await page.getByTestId('topbar-workspace-normal-chat').click();
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
});

test('web knowledge workspace negotiates text pdf and unsupported document requests', async ({ page }) => {
  await page.goto('/#/');

  await expect(page.getByTestId('document-workspace')).toBeVisible();

  await page.getByTestId('document-node-file').filter({ hasText: 'notes.txt' }).click();
  await expect(page.getByTestId('document-editor-surface')).toBeVisible();
  await expect(page.getByTestId('document-save')).toBeEnabled();

  await page.getByTestId('document-node-file').filter({ hasText: 'report.pdf' }).click();
  await expect(page.getByTestId('document-pdf-viewer')).toBeVisible();
  await expect(page.getByTestId('document-save')).toBeDisabled();

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
  await expect(page.getByTestId('document-unsupported-viewer')).toContainText('application/octet-stream');

  await page.getByTestId('normal-input').fill('TRIGGER_ATTACHMENT_ECHO');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).not.toContainText('archive.bin [application/octet-stream]');
});
