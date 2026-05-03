import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const knowledgeFixtureRoot = path.resolve(__dirname, '../../../server/tests/fixtures/knowledge-workspace');
const docsIndexPath = path.join(knowledgeFixtureRoot, 'docs', 'index.md');

const searchShortcut = process.platform === 'darwin' ? 'Meta+f' : 'Control+f';

// --- Markdown search ---

test('markdown viewer search opens with Ctrl+F and shows match count', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('document-workspace')).toBeVisible();

  await page.locator('[data-path="/docs"] .tree-toggle').click();
  await page.locator('[data-path="/docs/overview.md"]').click();
  await expect(page.getByTestId('document-editor')).toBeVisible();

  await page.keyboard.press(searchShortcut);
  await expect(page.getByTestId('document-viewer-search')).toBeVisible();

  await page.getByTestId('document-viewer-search-input').fill('docs');
  await expect(page.getByTestId('document-viewer-search-count')).toContainText('/2');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('document-viewer-search')).not.toBeVisible();
});

// --- Local conversation rename ---

test('local conversation rename updates the history item title', async ({ page }) => {
  await page.goto('/#/chat');
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();

  await page.getByTestId('normal-input').fill('Rename e2e test conversation');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('local-history-item').first()).toBeVisible();

  const historyItem = page.getByTestId('local-history-item').first();
  await historyItem.hover();
  await page.getByTestId('local-history-actions-menu').first().click({ force: true });
  await page.getByTestId('local-history-rename').first().click({ force: true });

  await expect(page.getByTestId('local-history-rename-input')).toBeVisible();
  await page.getByTestId('local-history-rename-input').fill('My renamed chat');
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('local-history-item').first()).toContainText('My renamed chat');
  await expect(page.getByTestId('local-history-rename-form')).not.toBeVisible();
});

// --- Save dirty state ---

test('document save button reflects dirty state after edit', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('document-workspace')).toBeVisible();

  await page.locator('[data-path="/notes.txt"]').click();
  await expect(page.getByTestId('document-editor')).toBeVisible();

  const saveButton = page.getByTestId('document-save');
  await expect(saveButton).not.toHaveClass(/save-button--dirty/);

  const editorInput = page.getByTestId('document-editor-input');
  await editorInput.fill('e2e dirty state test ' + Date.now());
  await expect(saveButton).toHaveClass(/save-button--dirty/);

  await saveButton.click();
  await expect(saveButton).not.toHaveClass(/save-button--dirty/);
});

// --- Shared functional detail expansion ---

test('assistant message shows collapsible functional detail parts', async ({ page }) => {
  await page.goto('/#/chat');
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();

  await page.getByTestId('normal-input').fill('TRIGGER_FUNCTIONAL_PARTS');
  await page.getByTestId('normal-send').click();

  await expect(page.getByTestId('message-functional-parts')).toBeVisible({ timeout: 20_000 });
  const part = page.getByTestId('message-functional-part').first();
  await expect(part).toBeVisible();

  const summary = part.locator('summary');
  await expect(summary).toContainText('mock_tool');

  const isExpanded = await part.evaluate((el) => (el as HTMLDetailsElement).open);
  expect(isExpanded).toBe(false);

  await summary.click();
  await expect(part).toHaveAttribute('open', '');
  await expect(part).toContainText('Request');
  await expect(part).toContainText('Response');
});

// --- Agent folder index.md ---

test.describe.serial('agent folder shows index.md inside AgentView when present', () => {
  test.beforeEach(async () => {
    await fs.writeFile(
      docsIndexPath,
      '# Docs Index\n\nThis is the docs agent index page.\n'
    );
  });

  test.afterEach(async () => {
    await fs.rm(docsIndexPath, { force: true });
  });

  test('clicking agent owner directory shows editable index.md inside AgentView and preserves agent context', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.locator('[data-path="/docs"]').click();

    await expect(page.getByTestId('agent-view')).toBeVisible();
    await expect(page.getByTestId('document-editor')).toBeVisible();
    await expect(page.locator('.editor-path')).toContainText('index.md');

    const editorInput = page.getByTestId('document-editor-input');
    await expect(editorInput).toBeVisible();
    await expect(page.getByTestId('document-save')).not.toHaveClass(/save-button--dirty/);

    await editorInput.fill('# Docs Index\n\nUpdated from AgentView editor.\n');
    await expect(page.getByTestId('document-save')).toHaveClass(/save-button--dirty/);
    await page.getByTestId('document-save').click();
    await expect(page.getByTestId('document-save')).not.toHaveClass(/save-button--dirty/);

    await expect.poll(async () => await fs.readFile(docsIndexPath, 'utf8')).toContain('Updated from AgentView editor.');

    await expect(page.getByTestId('agent-pane')).toBeVisible();
    await expect(page.getByTestId('agent-name')).toContainText('Docs Agent');
  });
});
