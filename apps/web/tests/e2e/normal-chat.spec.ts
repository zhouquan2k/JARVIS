import { expect, test } from '@playwright/test';

test('normal chat can send message and recover history after reload', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();

  const input = page.getByTestId('normal-input');
  const sendButton = page.getByTestId('normal-send');
  const prompt = 'Playwright normal flow message';

  await input.fill(prompt);
  await sendButton.click();

  await expect(page.getByTestId('normal-stop')).toBeVisible();
  await expect(page.getByTestId('normal-messages')).toContainText(prompt);
  await expect(page.getByTestId('normal-messages')).toContainText('gemini-api/');
  await expect(page.getByTestId('normal-stop')).toBeHidden();

  await page.reload();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('history-item').first()).toBeVisible();
  await expect(page.getByTestId('history-item').first()).toContainText('Playwright normal flow message');
});

test('normal chat renders markdown from assistant output', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();

  await page.getByTestId('normal-input').fill('TRIGGER_MARKDOWN_NATIVE');
  await page.getByTestId('normal-send').click();

  await expect(page.getByTestId('normal-messages').locator('h2').first()).toContainText('Markdown');
  await expect(page.getByTestId('normal-messages').locator('ul li').first()).toContainText('第一条要点');
  await expect(page.getByTestId('normal-messages').locator('pre code').first()).toContainText("console.log('markdown from model')");
});
