import { expect, test } from '@playwright/test';

test('compare chat accepts markdown fenced json with array fields', async ({ page }) => {
  await page.goto('/#/compare');
  await expect(page.getByTestId('compare-chat-view')).toBeVisible();

  await page.getByTestId('compare-input').fill('TRIGGER_MD_ARRAY_ANALYSIS');
  await page.getByTestId('compare-send').click();

  await expect(page.getByTestId('analysis-grid')).toBeVisible();
  await expect(page.getByTestId('analysis-error')).toBeHidden();
  await expect(page.getByTestId('analysis-grid')).toContainText('共同问题原文：TRIGGER_MD_ARRAY_ANALYSIS');
  await expect(page.getByTestId('analysis-grid')).toContainText('A原文片段：');
});
