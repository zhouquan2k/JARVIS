import { expect, test } from '@playwright/test';

test('compare chat streams A/B and auto switches to analysis tab', async ({ page }) => {
  await page.goto('/#/compare');
  await expect(page.getByTestId('compare-chat-view')).toBeVisible();

  await page.getByTestId('compare-input').fill('Compare this question with two models');
  await page.getByTestId('compare-send').click();

  const analysisTab = page.getByTestId('tab-analysis');
  await expect(analysisTab).toHaveClass(/active/);

  await expect(page.getByTestId('analysis-grid')).toBeVisible();
  await expect(page.getByTestId('analysis-grid')).toContainText('共识');
  await expect(page.getByTestId('analysis-grid')).toContainText('Model A 分歧');
  await expect(page.getByTestId('analysis-grid')).toContainText('Model B 分歧');

  await page.getByTestId('tab-native').click();
  await expect(page.getByTestId('output-a')).toContainText('Compare this question with two models');
  await expect(page.getByTestId('output-b')).toContainText('Compare this question with two models');

  await page.getByTestId('compare-new').click();
  await expect(page.getByTestId('output-a')).toContainText('等待输入...');
  await expect(page.getByTestId('output-b')).toContainText('等待输入...');
  await expect(page.getByText('当前问题：')).toBeHidden();

  await page.reload();
  await expect(page.getByTestId('compare-chat-view')).toBeVisible();
});

test('compare native panel renders markdown output', async ({ page }) => {
  await page.goto('/#/compare');
  await expect(page.getByTestId('compare-chat-view')).toBeVisible();

  await page.getByTestId('compare-input').fill('TRIGGER_MARKDOWN_NATIVE');
  await page.getByTestId('compare-send').click();

  await expect(page.getByTestId('analysis-grid')).toBeVisible();
  await page.getByTestId('tab-native').click();
  await expect(page.getByTestId('output-a').locator('h2').first()).toContainText('Markdown');
  await expect(page.getByTestId('output-a').locator('ul li').first()).toContainText('第一条要点');
  await expect(page.getByTestId('output-a').locator('pre code').first()).toContainText("console.log('markdown from model')");
});
