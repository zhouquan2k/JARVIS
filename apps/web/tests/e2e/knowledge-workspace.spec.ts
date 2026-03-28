import { expect, test } from '@playwright/test';

test('web knowledge workspace supports file browsing markdown editing and top-level workspace switching', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('knowledge-workspace')).toBeVisible();
  await expect(page.getByTestId('knowledge-file-tree')).toBeVisible();
  await expect(page.getByTestId('knowledge-editor')).toBeVisible();
  await expect(page.getByTestId('knowledge-assistant-pane')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('knowledge-agent-name')).not.toHaveText('');

  const editor = page.getByTestId('knowledge-editor-input');
  await expect(editor).toBeVisible();

  await page.getByTestId('knowledge-node-file').first().click();
  await editor.fill('Playwright knowledge web');
  await page.getByTestId('knowledge-save').click();

  await page.getByTestId('normal-input').fill('KNOWLEDGE_AGENT_NATIVE');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).toContainText('KNOWLEDGE_AGENT_NATIVE');
  await expect(page.getByTestId('normal-messages')).toContainText('agent(');

  await page.getByTestId('topbar-workspace-normal-chat').click();
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
});
