import { expect, test } from '@playwright/test';

test('compare chat shows analysis fallback when analyzer returns invalid json', async ({ page }) => {
  await page.goto('/#/compare');
  await expect(page.getByTestId('compare-chat-view')).toBeVisible();

  await page.getByTestId('compare-input').fill('TRIGGER_BAD_ANALYSIS');
  await page.getByTestId('compare-send').click();

  await expect(page.getByTestId('analysis-error')).toBeVisible();
  await expect(page.getByTestId('analysis-error')).toContainText('Analysis parsing failed');

  await page.getByTestId('tab-native').click();
  await expect(page.getByTestId('output-a')).toContainText('TRIGGER_BAD_ANALYSIS');
  await expect(page.getByTestId('output-b')).toContainText('TRIGGER_BAD_ANALYSIS');
});
