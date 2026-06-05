import { expect, test } from '@playwright/test';

test('web2 boots workspace with default task surfaces enabled', async ({ page }) => {
  await page.goto('/#/');

  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await expect(page.getByTestId('document-file-tree')).toBeVisible();
  await expect(page.getByTestId('workspace-right-pane')).toBeVisible();
  await expect(page.getByTestId('topbar-workspace-normal-chat')).toBeVisible();
  await expect(page.getByTestId('topbar-workspace-all-tasks')).toHaveCount(1);
  await expect(page.getByTestId('workspace-right-pane-tab-tasks')).toHaveCount(1);

  await page.getByTestId('topbar-workspace-normal-chat').click();
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
});
