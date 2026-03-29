import { expect, test } from '@playwright/test';

test('web knowledge workspace supports file browsing markdown editing diff undo redo and top-level workspace switching', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('knowledge-workspace')).toBeVisible();
  await expect(page.getByTestId('knowledge-file-tree')).toBeVisible();
  await expect(page.getByTestId('knowledge-editor')).toBeVisible();
  await expect(page.getByTestId('knowledge-assistant-pane')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('knowledge-agent-name')).not.toHaveText('');
  await expect(page.getByTestId('knowledge-editor-empty')).toBeVisible();

  await page.getByTestId('knowledge-node-file').first().click();
  const editor = page.getByTestId('knowledge-editor-input');
  await expect(editor).toBeVisible();
  await editor.fill('Playwright knowledge web');
  await page.getByTestId('knowledge-save').click();

  await page.getByTestId('normal-input').fill('TRIGGER_AGENT_REPLACE_ACTIVE_FILE');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).toContainText('replace_text_in_file');
  await expect(page.getByTestId('normal-messages')).toContainText('updated by agent');
  await expect(page.getByTestId('knowledge-file-change')).toBeVisible();
  await expect(page.getByTestId('knowledge-file-diff')).toContainText('Playwright knowledge web updated by agent');

  await page.getByTestId('knowledge-file-change-undo').click();
  await expect(page.getByTestId('knowledge-file-change-redo')).toBeEnabled();
  await expect(page.getByTestId('knowledge-file-diff')).toContainText('Playwright knowledge web');

  await page.getByTestId('knowledge-file-change-redo').click();
  await expect(page.getByTestId('knowledge-file-diff')).toContainText('updated by agent');

  await page.getByTestId('topbar-workspace-normal-chat').click();
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
});
