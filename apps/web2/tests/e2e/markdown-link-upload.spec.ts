import { expect, test } from '@playwright/test';

test('markdown link picker upload triggers file chooser and inserts uploaded resource link', async ({ page }) => {
  await page.goto('/#/');

  await page.locator('[data-testid="document-node-file"][data-path="/guide.md"]').click();
  await expect(page.getByTestId('document-editor')).toBeVisible();

  await page.getByTestId('markdown-insert-link').click();
  await page.getByTestId('markdown-link-tab-resource').click();
  await expect(page.getByTestId('markdown-resource-upload')).toBeVisible();

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('markdown-resource-upload').click()
  ]);

  await fileChooser.setFiles({
    name: 'upload-check.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('upload check')
  });

  await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('document-editor')).toContainText('guide');
});
