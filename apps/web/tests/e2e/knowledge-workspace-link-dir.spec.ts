import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const knowledgeFixtureRoot = path.resolve(__dirname, '../../../server/tests/fixtures/knowledge-workspace');
const linkedDataRoot = path.resolve(__dirname, '../../../server/tests/fixtures/knowledge-workspace-linked-data');
const reportsRoot = path.join(knowledgeFixtureRoot, 'reports');
const reportsConfigPath = path.join(reportsRoot, '.agent.json');
const linkedSummaryPath = path.join(linkedDataRoot, 'summary.md');
const linkedArchivePath = path.join(linkedDataRoot, 'archive');
const linkedArchiveConfigPath = path.join(linkedArchivePath, '.agent.json');
const linkedHistoryPath = path.join(linkedArchivePath, 'history.md');

test.describe.serial('web knowledge workspace linkDir', () => {
  async function resetMountedWorkspaceFixture() {
    await fs.rm(reportsRoot, { recursive: true, force: true });
    await fs.mkdir(reportsRoot, { recursive: true });
    await fs.mkdir(linkedArchivePath, { recursive: true });
    await fs.writeFile(
      reportsConfigPath,
      JSON.stringify({
        name: 'Reports Mount',
        instructions: 'Handle mounted reports.',
        linkDir: '../../knowledge-workspace-linked-data'
      }, null, 2)
        .concat('\n')
    );
    await fs.writeFile(
      linkedSummaryPath,
      ['# Mounted Summary', '', 'This document lives outside the workspace root and is mounted through `reports`.'].join('\n')
        .concat('\n')
    );
    await fs.writeFile(
      linkedArchiveConfigPath,
      JSON.stringify({
        name: 'Archive Agent',
        instructions: 'Handle mounted archives.'
      }, null, 2)
        .concat('\n')
    );
    await fs.writeFile(
      linkedHistoryPath,
      ['# Mounted History', '', 'Archived notes for the mounted workspace.'].join('\n')
        .concat('\n')
    );
  }

  test.beforeEach(async () => {
    await resetMountedWorkspaceFixture();
  });

  test.afterAll(async () => {
    await resetMountedWorkspaceFixture();
  });

  test('shows a linked top-level directory in the file tree', async ({ page }) => {
    await page.goto('/#/');

    const reportsNode = page.locator('[data-path="/reports"]');
    await expect(reportsNode).toBeVisible();
    await expect(reportsNode.getByTestId('document-node-agent-owner')).toBeVisible();

    await reportsNode.click();
    await expect(page.getByTestId('agent-view')).toBeVisible();
    await expect(page.getByTestId('agent-view-scope')).toContainText('/reports');
    await expect(page.getByTestId('agent-name')).toContainText('Reports Mount');
    await expect(page.getByTestId('agent-view-document').filter({ hasText: 'summary.md' })).toHaveCount(1);
  });

  test('writes to a mounted document and keeps the update after reload', async ({ page }) => {
    await page.goto('/#/');

    await page.locator('[data-path="/reports"] .tree-toggle').click();
    await page.getByTestId('document-node-file').filter({ hasText: 'summary.md' }).click();

    const editor = page.getByTestId('document-editor-input');
    await expect(editor).toBeVisible();
    await editor.fill('# Playwright Mounted Summary\n');
    await expect(page.getByTestId('document-save')).toBeEnabled();
    await page.getByTestId('document-save').click();

    await expect.poll(async () => {
      return fs.readFile(linkedSummaryPath, 'utf8');
    }).toContain('Playwright Mounted Summary');

    await page.reload();
    await page.locator('[data-path="/reports"] .tree-toggle').click();
    await page.getByTestId('document-node-file').filter({ hasText: 'summary.md' }).click();
    await expect(page.getByTestId('document-editor-input')).toContainText('Playwright Mounted Summary');
  });

  test('renames and deletes only the mount alias entry', async ({ page }) => {
    await page.goto('/#/');

    const reportsNode = page.locator('[data-path="/reports"]');
    await reportsNode.dblclick();
    await page.getByTestId('document-rename-node-input').fill('briefs');
    await page.getByTestId('document-rename-node-input').press('Enter');

    const briefsNode = page.locator('[data-path="/briefs"]');
    await expect(briefsNode).toBeVisible();
    await expect(page.locator('[data-path="/reports"]')).toHaveCount(0);

    await briefsNode.click();
    await page.getByTestId('document-delete-node').click();
    await page.getByTestId('document-delete-confirm-yes').click();

    await expect(page.locator('[data-path="/briefs"]')).toHaveCount(0);
    await expect(page.locator('[data-path="/reports"]')).toHaveCount(0);
    await expect.poll(async () => {
      return fs.readFile(linkedSummaryPath, 'utf8');
    }).toContain('Mounted Summary');
  });
});
