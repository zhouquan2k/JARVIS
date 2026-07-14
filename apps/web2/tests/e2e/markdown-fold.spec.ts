import { expect, test } from '@playwright/test';

// Folding is implemented in the viewer (Milkdown) mode as ProseMirror decorations:
// a `.markdown-fold-toggle` widget button at the start of every visible heading,
// and a `.markdown-fold-hidden` node decoration (display:none) on blocks inside a
// collapsed heading's region. State is session-only (in-memory per editor instance).
const foldToggles = (page: import('@playwright/test').Page) =>
  page.locator('div[data-testid="document-editor-input"][contenteditable="true"] .markdown-fold-toggle');

test.describe('markdown heading fold in viewer mode', () => {
  test('collapsing a heading hides its section until toggled back', async ({ page }) => {
    await page.goto('/#/');

    await page.locator('[data-testid="document-node-file"][data-path="/fold-sample.md"]').click();
    await expect(page.getByTestId('document-editor')).toBeVisible();
    // Starts in viewer mode.
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');

    // Every heading gets a toggle: Section A (h1), Sub A1 (h2), Section B (h1).
    await expect(foldToggles(page)).toHaveCount(3);
    await expect(page.getByText('Para under A.', { exact: true })).toBeVisible();
    await expect(page.getByText('Para under A1.', { exact: true })).toBeVisible();
    await expect(page.getByText('Para under B.', { exact: true })).toBeVisible();

    await page.screenshot({ path: 'playwright-report/fold-expanded.png', fullPage: true });

    // Collapse Section A (first toggle) — its whole region (paragraph, nested Sub A1
    // heading and its paragraph) must hide, while Section B stays visible.
    await foldToggles(page).first().click();

    await expect(page.getByText('Para under A.', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Sub A1', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Para under A1.', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Section B', { exact: true })).toBeVisible();
    await expect(page.getByText('Para under B.', { exact: true })).toBeVisible();
    // The nested Sub A1 toggle is hidden with its heading, leaving Section A + Section B.
    await expect(foldToggles(page)).toHaveCount(2);

    await page.screenshot({ path: 'playwright-report/fold-collapsed.png', fullPage: true });

    // Expand again — the section is restored.
    await foldToggles(page).first().click();
    await expect(page.getByText('Para under A.', { exact: true })).toBeVisible();
    await expect(page.getByText('Para under A1.', { exact: true })).toBeVisible();
    await expect(foldToggles(page)).toHaveCount(3);
  });

  test('toolbar fold-all button collapses and expands every heading', async ({ page }) => {
    await page.goto('/#/');

    await page.locator('[data-testid="document-node-file"][data-path="/fold-sample.md"]').click();
    await expect(page.getByTestId('document-editor')).toBeVisible();
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');

    const foldAllButton = page.getByTestId('markdown-fold-all-toggle');
    await expect(foldAllButton).toBeVisible();
    await expect(foldToggles(page)).toHaveCount(3);

    // Collapse all: every top-level section hides, only the two h1 toggles remain visible.
    await foldAllButton.click();
    await expect(page.getByText('Para under A.', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Sub A1', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Para under A1.', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Para under B.', { exact: true })).not.toBeVisible();
    await expect(foldToggles(page)).toHaveCount(2);

    // Expand all: everything is restored, including the nested Sub A1 toggle.
    await foldAllButton.click();
    await expect(page.getByText('Para under A.', { exact: true })).toBeVisible();
    await expect(page.getByText('Para under A1.', { exact: true })).toBeVisible();
    await expect(page.getByText('Para under B.', { exact: true })).toBeVisible();
    await expect(foldToggles(page)).toHaveCount(3);

    // The button is only meaningful in viewer mode; it must not appear in source-edit mode.
    await page.getByTestId('markdown-mode-toggle').click();
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(foldAllButton).not.toBeVisible();
  });
});
