import { expect, test } from '@playwright/test';

// In viewer mode the ProseMirror contenteditable div has data-testid="document-editor-input" (injected by
// markdownDocument.ts). In textarea edit mode the <textarea> element carries the same testid.
// Use tag-specific selectors to distinguish the two modes.
const viewerEditorLocator = (page: import('@playwright/test').Page) =>
  page.locator('div[data-testid="document-editor-input"][contenteditable="true"]');
const textareaLocator = (page: import('@playwright/test').Page) =>
  page.locator('textarea[data-testid="document-editor-input"]');

test.describe('viewer-mode in-place editing', () => {
  test('highlight in viewer mode does not trigger viewer→edit→viewer round-trip', async ({ page }) => {
    await page.goto('/#/');

    await page.locator('[data-testid="document-node-file"][data-path="/guide.md"]').click();
    await expect(page.getByTestId('document-editor')).toBeVisible();

    // Start in viewer mode.
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');

    // Open style picker and click highlight.
    await page.getByTestId('markdown-style-picker-trigger').click();
    await expect(page.getByTestId('markdown-style-picker')).toBeVisible();
    await page.getByTestId('markdown-style-option-highlight').click();

    // After applying highlight, viewer mode must be maintained — no round-trip.
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('markdown-style-picker')).not.toBeVisible();
    // No textarea must appear (textarea = edit source mode).
    await expect(textareaLocator(page)).not.toBeVisible();
    // ProseMirror viewer surface should remain.
    await expect(viewerEditorLocator(page)).toBeVisible();
  });

  test('highlight can be toggled off in viewer mode', async ({ page }) => {
    await page.goto('/#/');

    await page.locator('[data-testid="document-node-file"][data-path="/guide.md"]').click();
    await expect(page.getByTestId('document-editor')).toBeVisible();
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');

    // First toggle: apply.
    await page.getByTestId('markdown-style-picker-trigger').click();
    await page.getByTestId('markdown-style-option-highlight').click();
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');

    // Second toggle: remove — viewer mode still maintained.
    await page.getByTestId('markdown-style-picker-trigger').click();
    await page.getByTestId('markdown-style-option-highlight').click();
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(textareaLocator(page)).not.toBeVisible();
    await expect(viewerEditorLocator(page)).toBeVisible();
  });

  test('viewport scroll position is preserved after highlight in viewer mode', async ({ page }) => {
    await page.goto('/#/');

    await page.locator('[data-testid="document-node-file"][data-path="/guide.md"]').click();
    await expect(page.getByTestId('document-editor')).toBeVisible();
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');

    // Scroll down inside the document viewer pane.
    const pane = page.getByTestId('document-editor-scroll-shell');
    await pane.evaluate((el) => { el.scrollTop = 200; });
    const scrollBefore = await pane.evaluate((el) => el.scrollTop);

    // Apply highlight (without selection — empty selection case, toggles stored mark).
    await page.getByTestId('markdown-style-picker-trigger').click();
    await page.getByTestId('markdown-style-option-highlight').click();
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');

    const scrollAfter = await pane.evaluate((el) => el.scrollTop);
    // Viewport must not jump to top after the in-place operation.
    expect(scrollAfter).toBeGreaterThanOrEqual(scrollBefore - 10);
  });

  test('document link insertion in viewer mode stays in viewer without source round-trip', async ({ page }) => {
    await page.goto('/#/');

    await page.locator('[data-testid="document-node-file"][data-path="/guide.md"]').click();
    await expect(page.getByTestId('document-editor')).toBeVisible();
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('markdown-insert-link').click();
    await expect(page.getByTestId('markdown-link-picker')).toBeVisible();

    // Select a document link (if any linkable documents exist in the fixture).
    const linkOption = page.locator('[data-testid^="markdown-link-option-"]').first();
    const hasLink = await linkOption.count() > 0;
    if (!hasLink) {
      // No linkable documents available — just close picker and verify no mode switch.
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
      return;
    }

    await linkOption.click();

    // After insertion, viewer mode must be maintained.
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('markdown-link-picker')).not.toBeVisible();
    // No textarea (edit mode) should appear.
    await expect(textareaLocator(page)).not.toBeVisible();
    await expect(viewerEditorLocator(page)).toBeVisible();
  });
});
