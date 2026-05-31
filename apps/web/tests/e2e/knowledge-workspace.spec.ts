import { expect, test, type APIRequestContext } from '@playwright/test';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const contextApiBase = 'http://127.0.0.1:8790/api/context';
const testDir = path.dirname(fileURLToPath(import.meta.url));
const knowledgeFixtureRoot = path.resolve(testDir, '../../../server/tests/fixtures/knowledge-workspace');

test.describe.configure({ mode: 'serial' });

async function openConversationTab(page: import('@playwright/test').Page) {
  await page.getByTestId('agent-right-pane-tab-conversations').click();
  await expect(page.getByTestId('agent-conversation-panel')).toBeVisible();
}

async function readContextJson(request: APIRequestContext, path: string) {
  const response = await request.post(`${contextApiBase}/read-document`, { data: { path } });
  const payload = await response.json();
  return JSON.parse(Buffer.from(payload.document.dataBase64, 'base64').toString('utf8'));
}

async function readContextText(request: APIRequestContext, path: string) {
  const response = await request.post(`${contextApiBase}/read-document`, { data: { path } });
  const payload = await response.json();
  return Buffer.from(payload.document.dataBase64, 'base64').toString('utf8');
}

function formatTaskDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTaskTimeInput(value: Date) {
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

test('web knowledge workspace supports file browsing editing and top-level workspace switching', async ({ page, request }) => {
  const baseName = `playwright-agent-file-${Date.now()}`;
  const docVirtualPath = `/${baseName}.txt`;
  const docDiskPath = path.join(knowledgeFixtureRoot, `${baseName}.txt`);

  await writeFile(docDiskPath, 'Playwright knowledge web', 'utf8');

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();
    await expect(page.getByTestId('document-file-tree')).toBeVisible();
    await expect(page.getByTestId('agent-right-pane')).toBeVisible();
    await expect(page.getByTestId('agent-view')).toContainText('Default Knowledge Agent');
    await expect(page.getByTestId('agent-view-scope')).toContainText('/');
    await expect(page.getByTestId('document-node-root')).toHaveClass(/active/);
    await expect(page.getByTestId('document-editor')).toHaveCount(0);

    await page.locator(`[data-path="${docVirtualPath}"]`).click();
    await openConversationTab(page);
    await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();
    await expect(page.getByTestId('agent-document-conversation-empty')).toBeVisible();
    await expect(page.getByTestId('document-editor-input')).toBeVisible();

    await page.getByTestId('agent-conversation-list-plus').click();
    await expect(page.getByTestId('agent-conversation-toolbar')).toBeVisible();
    await page.getByTestId('normal-input').fill('Guide linked conversation');
    await page.getByTestId('normal-send').click();
    await expect(page.getByTestId('agent-conversation-title')).toContainText('Guide linked conversation');
    await page.getByTestId('agent-conversation-back').click();
    await expect(page.getByTestId('agent-document-conversation-item')).toContainText('Guide linked conversation');
    await page.getByTestId('agent-document-conversation-item').click();
    await expect(page.getByTestId('agent-conversation-toolbar')).toBeVisible();
    await page.getByTestId('agent-conversation-list-plus').click();
    await expect(page.getByTestId('agent-conversation-title')).toContainText('New Chat');
    await page.getByTestId('normal-input').fill('TRIGGER_AGENT_REPLACE_ACTIVE_FILE');
    await page.getByTestId('normal-send').click();
    await expect(page.getByTestId('normal-messages')).toContainText('updated by agent');
    await expect.poll(async () => readContextText(request, docVirtualPath)).toContain('Playwright knowledge web updated by agent');

    await page.getByTestId('agent-conversation-back').click();
    await page.getByTestId('document-node-file').filter({ hasText: 'notes.txt' }).click();
    await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();
    await expect(page.getByTestId('agent-document-conversation-empty')).toBeVisible();
    await page.getByTestId('agent-conversation-list-plus').click();
    await page.getByTestId('normal-input').fill('Notes linked conversation');
    await page.getByTestId('normal-send').click();
    await page.getByTestId('agent-conversation-back').click();
    await expect(page.getByTestId('agent-document-conversation-item')).toContainText('Notes linked conversation');

    await page.locator(`[data-path="${docVirtualPath}"]`).click();
    await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();
    await expect(page.getByTestId('agent-document-conversation-list')).not.toContainText('Notes linked conversation');

    await page.getByTestId('topbar-workspace-normal-chat').click();
    await expect(page.getByTestId('conversation-workspace')).toBeVisible();
    await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  } finally {
    await rm(docDiskPath, { force: true });
  }
});

test('web knowledge workspace preserves the shared conversation and restores the agent selection after chat mode switches', async ({ page }) => {
  await page.goto('/#/');

  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await page.locator('[data-path="/guide.md"]').click();
  await openConversationTab(page);
  await expect(page.getByTestId('document-editor-input')).toBeVisible();

  await page.getByTestId('agent-conversation-list-plus').click();
  await expect(page.getByTestId('agent-conversation-toolbar')).toBeVisible();
  await page.getByTestId('normal-input').fill('Shared agent conversation');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('agent-conversation-title')).toContainText('Shared agent conversation');

  await page.getByTestId('agent-conversation-expand').click();
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('workspace-sidebar')).toHaveClass(/collapsed/);
  await expect(page.getByTestId('normal-messages')).toContainText('Shared agent conversation');

  await page.getByTestId('sidebar-toggle').click();
  await page.getByTestId('sidebar-new-chat').click();
  await page.getByTestId('normal-input').fill('Temporary chat mode conversation');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).toContainText('Temporary chat mode conversation');

  await page.getByTestId('workspace-restore').click();
  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await expect(page.getByTestId('document-editor-input')).toBeVisible();
  await openConversationTab(page);
  await expect(page.getByTestId('agent-conversation-toolbar')).toBeVisible();
  await expect(page.getByTestId('agent-conversation-title')).toContainText('Shared agent conversation');
  await expect(page.getByTestId('agent-document-conversation-list')).toHaveCount(0);
});

test('web knowledge workspace replaces New Chat for a new Agent conversation after the first send', async ({ page }) => {
  await page.goto('/#/');

  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await page.locator('[data-path="/guide.md"]').click();
  await openConversationTab(page);
  await page.getByTestId('agent-conversation-list-plus').click();
  await expect(page.getByTestId('agent-conversation-title')).toContainText('New Chat');

  await page.getByTestId('normal-input').fill('请帮我总结 guide 文档里的关键步骤和风险');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('agent-conversation-title')).not.toContainText('New Chat');

  await page.getByTestId('agent-conversation-back').click();
  await expect(page.getByTestId('agent-document-conversation-item').first()).not.toContainText('New Chat');
});

test('web knowledge workspace manages document-scoped and project-scoped tasks from the right pane tabs', async ({ page }, testInfo) => {
  const baseName = `playwright-task-${testInfo.workerIndex}-${Date.now()}`;
  const docVirtualPath = `/${baseName}.md`;
  const docDiskPath = path.join(knowledgeFixtureRoot, `${baseName}.md`);
  const ownerDiskPath = path.join(knowledgeFixtureRoot, `${baseName}-owner`);
  const ownerVirtualPath = `/${baseName}-owner`;
  const ownerNoteDiskPath = path.join(ownerDiskPath, 'note.md');

  await writeFile(docDiskPath, '# Task Doc\n', 'utf8');
  await mkdir(ownerDiskPath, { recursive: true });
  await writeFile(path.join(ownerDiskPath, '.agent.json'), JSON.stringify({
    name: `${baseName} Owner Agent`,
    instructions: 'Own project tasks.'
  }, null, 2), 'utf8');
  await writeFile(ownerNoteDiskPath, '# Owner Note\n', 'utf8');

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.locator(`[data-path="${docVirtualPath}"]`).click();
    await page.getByTestId('agent-right-pane-tab-tasks').click();
    await expect(page.getByTestId('agent-task-panel')).toBeVisible();
    await page.getByTestId('agent-task-add').click();
    await page.getByTestId('task-editor-title').fill('Document task');
    await page.getByTestId('task-editor-notes').fill('Visible only in document scope');
    await page.getByTestId('task-editor-due-at').fill('2026-05-24');
    await page.getByTestId('task-editor-time-toggle').click();
    await page.getByTestId('task-editor-due-time').fill('09:30');
    await page.getByTestId('task-editor-priority').selectOption('high');
    await page.getByTestId('task-editor-save').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText('Document task');
    await expect(page.getByTestId('agent-task-open-list')).toContainText('Visible only in document scope');

    await page.locator(`[data-path="${ownerVirtualPath}"]`).click();
    await expect(page.getByTestId('agent-view')).toBeVisible();
    await page.getByTestId('agent-right-pane-tab-tasks').click();
    await page.getByTestId('agent-task-add').click();
    await page.getByTestId('task-editor-title').fill('Project task');
    await page.getByTestId('task-editor-save').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText('Project task');
    await expect(page.getByTestId('agent-task-open-list')).not.toContainText('Document task');

    await page.locator('[data-testid^="agent-task-complete-"]').first().check();
    await page.getByTestId('agent-task-completed-toggle').click();
    await expect(page.getByTestId('agent-task-completed-list')).toContainText('Project task');
    await page.locator('[data-testid^="agent-task-reopen-"]').first().uncheck();
    await expect(page.getByTestId('agent-task-open-list')).toContainText('Project task');

    await page.getByTestId('agent-right-pane-tab-conversations').click();
    await expect(page.getByTestId('agent-conversation-panel')).toBeVisible();

    await page.locator(`[data-path="${docVirtualPath}"]`).click();
    await page.getByTestId('agent-right-pane-tab-tasks').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText('Document task');
    await expect(page.getByTestId('agent-task-open-list')).not.toContainText('Project task');
    await page.locator('[data-testid^="agent-task-menu-"]').first().click();
    await page.locator('[data-testid^="agent-task-delete-"]').first().click();
    await expect(page.getByTestId('agent-task-open-list')).not.toContainText('Document task');
  } finally {
    await rm(docDiskPath, { force: true });
    await rm(ownerDiskPath, { recursive: true, force: true });
  }
});

test('web all-tasks workspace switches between today and planned global filters', async ({ page }, testInfo) => {
  const baseName = `playwright-all-tasks-${testInfo.workerIndex}-${Date.now()}`;
  const docVirtualPath = `/${baseName}.md`;
  const docDiskPath = path.join(knowledgeFixtureRoot, `${baseName}.md`);
  const ownerDiskPath = path.join(knowledgeFixtureRoot, `${baseName}-owner`);
  const ownerVirtualPath = `/${baseName}-owner`;
  const laterToday = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  await writeFile(docDiskPath, '# Global Tasks Doc\n', 'utf8');
  await mkdir(ownerDiskPath, { recursive: true });
  await writeFile(path.join(ownerDiskPath, '.agent.json'), JSON.stringify({
    name: `${baseName} Global Owner`,
    instructions: 'Own all-task test data.'
  }, null, 2), 'utf8');

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.locator(`[data-path="${docVirtualPath}"]`).click();
    await page.getByTestId('agent-right-pane-tab-tasks').click();
    await page.getByTestId('agent-task-add').click();
    await page.getByTestId('task-editor-title').fill('Today document task');
    await page.getByTestId('task-editor-due-at').fill(formatTaskDateInput(laterToday));
    await page.getByTestId('task-editor-time-toggle').click();
    await page.getByTestId('task-editor-due-time').fill(formatTaskTimeInput(laterToday));
    await page.getByTestId('task-editor-save').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText('Today document task');

    await page.locator(`[data-path="${ownerVirtualPath}"]`).click();
    await page.getByTestId('agent-right-pane-tab-tasks').click();
    await page.getByTestId('agent-task-add').click();
    await page.getByTestId('task-editor-title').fill('Planned project task');
    await page.getByTestId('task-editor-due-at').fill(formatTaskDateInput(futureDate));
    await page.getByTestId('task-editor-time-toggle').click();
    await page.getByTestId('task-editor-due-time').fill('09:00');
    await page.getByTestId('task-editor-save').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText('Planned project task');

    await page.getByTestId('topbar-workspace-all-tasks').click();
    await expect(page.getByTestId('all-tasks-workspace')).toBeVisible();
    await expect(page.getByTestId('task-list-panel')).toBeVisible();

    await page.getByTestId('all-tasks-shortcut-today').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText('Today document task');
    await expect(page.getByTestId('agent-task-open-list')).not.toContainText('Planned project task');

    await page.getByTestId('all-tasks-shortcut-planned').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText('Today document task');
    await expect(page.getByTestId('agent-task-open-list')).toContainText('Planned project task');

    const futureKey = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
    await expect(page.getByTestId(`task-group-title-${futureKey}`)).toBeVisible();
  } finally {
    await rm(docDiskPath, { force: true });
    await rm(ownerDiskPath, { recursive: true, force: true });
  }
});

test('web knowledge workspace appends .md on create, hides markdown suffixes, and shows non-markdown icons', async ({ page, request }, testInfo) => {
  const baseName = `playwright-tree-${testInfo.workerIndex}-${Date.now()}`;
  const virtualPath = `/${baseName}.md`;
  const diskPath = path.join(knowledgeFixtureRoot, `${baseName}.md`);

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.getByTestId('document-new-file').click();
    await page.getByTestId('document-pending-node-input').fill(baseName);
    await page.getByTestId('document-pending-node-input').press('Enter');

    const createdNode = page.locator(`[data-path="${virtualPath}"]`);
    await expect(createdNode).toBeVisible();
    await expect(createdNode).toContainText(baseName);
    await expect(createdNode).not.toContainText(`${baseName}.md`);
    await expect(page.getByTestId('document-editor-title')).toContainText(baseName);
    await expect(page.locator('[data-path="/notes.txt"] [data-testid="document-node-file-icon"][data-icon-kind="text"]')).toBeVisible();
    await expect.poll(async () => readContextText(request, virtualPath)).toBe('');
  } finally {
    await rm(diskPath, { force: true });
  }
});

test('web knowledge workspace inserts internal markdown links from the editor UI and opens the linked document', async ({ page, request }, testInfo) => {
  const baseName = `playwright-link-${testInfo.workerIndex}-${Date.now()}`;
  const sourceVirtualPath = `/${baseName}-source.md`;
  const targetVirtualPath = `/${baseName}-target.md`;
  const sourceDiskPath = path.join(knowledgeFixtureRoot, `${baseName}-source.md`);
  const targetDiskPath = path.join(knowledgeFixtureRoot, `${baseName}-target.md`);

  await writeFile(sourceDiskPath, 'Intro target', 'utf8');
  await writeFile(targetDiskPath, '# Target\n', 'utf8');

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.locator(`[data-path="${sourceVirtualPath}"]`).click();
    await openConversationTab(page);
    await expect(page.getByTestId('markdown-insert-link')).toBeVisible();
    await page.locator('[data-testid="document-editor-surface"] .ProseMirror p').evaluate(() => {
      const paragraph = document.querySelector('[data-testid="document-editor-surface"] .ProseMirror p');
      const textNode = paragraph?.firstChild;
      if (!textNode) {
        return;
      }

      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(textNode, 6);
      range.setEnd(textNode, 12);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.getByTestId('markdown-insert-link').click();
    await page.locator(`[data-testid="markdown-link-option-${targetVirtualPath}"]`).click();
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('document-save').click();

    await expect.poll(async () => readContextText(request, sourceVirtualPath)).toBe(`Intro [target](${baseName}-target.md)`);
    await page.getByRole('link', { name: 'target' }).click();
    await expect(page.locator(`[data-path="${targetVirtualPath}"]`)).toHaveClass(/active/);
    await expect(page.getByTestId('document-editor-title')).toContainText(`${baseName}-target`);
  } finally {
    await rm(sourceDiskPath, { force: true });
    await rm(targetDiskPath, { force: true });
  }
});

test('web knowledge workspace inserts conversation links and opens the requested conversation without replacing the document', async ({ page, request }, testInfo) => {
  const baseName = `playwright-conversation-link-${testInfo.workerIndex}-${Date.now()}`;
  const sourceVirtualPath = `/${baseName}.md`;
  const sourceDiskPath = path.join(knowledgeFixtureRoot, `${baseName}.md`);

  await writeFile(sourceDiskPath, 'See notes', 'utf8');

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.locator(`[data-path="${sourceVirtualPath}"]`).click();
    await openConversationTab(page);
    await page.getByTestId('agent-conversation-list-plus').click();
    await expect(page.getByTestId('normal-input')).toBeVisible();
    await page.getByTestId('normal-input').fill('Conversation link target');
    await page.getByTestId('normal-send').click();
    await expect(page.getByTestId('agent-conversation-title')).toContainText('Conversation link target');
    await page.getByTestId('agent-conversation-back').click();
    await expect(page.getByTestId('agent-document-conversation-item')).toContainText('Conversation link target');

    await page.locator('[data-testid="document-editor-surface"] .ProseMirror p').evaluate(() => {
      const paragraph = document.querySelector('[data-testid="document-editor-surface"] .ProseMirror p');
      const textNode = paragraph?.firstChild;
      if (!textNode) {
        return;
      }

      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(textNode, 4);
      range.setEnd(textNode, 9);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.getByTestId('markdown-insert-link').click();
    await page.getByTestId('markdown-link-tab-conversation').click();
    await page.locator('[data-testid^="markdown-conversation-link-option-"]').first().click();
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('document-save').click();

    await expect.poll(async () => readContextText(request, sourceVirtualPath)).toMatch(
      /\[notes\]\(chatprism:\/\/conversation\/[A-Za-z0-9._%-]+\)/
    );

    await page.getByRole('link', { name: 'notes' }).click();
    await expect(page.getByTestId('agent-conversation-title')).toContainText('Conversation link target');
    await expect(page.getByTestId('document-editor-title')).toContainText(baseName);
    await expect(page.locator(`[data-path="${sourceVirtualPath}"]`)).toHaveClass(/active/);
  } finally {
    await rm(sourceDiskPath, { force: true });
  }
});

test('web knowledge workspace embeds pdf resources from the unified link menu', async ({ page, request }, testInfo) => {
  const baseName = `playwright-resource-pdf-${testInfo.workerIndex}-${Date.now()}`;
  const sourceVirtualPath = `/${baseName}.md`;
  const sourceDiskPath = path.join(knowledgeFixtureRoot, `${baseName}.md`);
  const referencesDir = path.join(knowledgeFixtureRoot, 'references');
  const resourceFileName = `${baseName}.pdf`;
  const resourceVirtualPath = `/references/${resourceFileName}`;
  const resourceDiskPath = path.join(referencesDir, resourceFileName);

  await mkdir(referencesDir, { recursive: true });
  await writeFile(sourceDiskPath, 'Open spec', 'utf8');
  await writeFile(resourceDiskPath, '%PDF-1.4\n%', 'utf8');

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.locator(`[data-path="${sourceVirtualPath}"]`).click();
    await openConversationTab(page);
    await page.locator('[data-testid="document-editor-surface"] .ProseMirror p').evaluate(() => {
      const paragraph = document.querySelector('[data-testid="document-editor-surface"] .ProseMirror p');
      const textNode = paragraph?.firstChild;
      if (!textNode) {
        return;
      }

      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(textNode, 5);
      range.setEnd(textNode, 9);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.getByTestId('markdown-insert-link').click();
    await page.getByTestId('markdown-link-tab-resource').click();
    await page.getByTestId(`markdown-resource-link-option-${resourceVirtualPath}`).click();
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('document-save').click();

    await expect.poll(async () => readContextText(request, sourceVirtualPath)).toContain('```cp-pdf-embed');
    await expect(page.locator('[data-testid="document-editor-surface"] .markdown-pdf-embed object')).toHaveCount(1);
  } finally {
    await rm(sourceDiskPath, { force: true });
    await rm(resourceDiskPath, { force: true });
  }
});

test('web knowledge workspace embeds image resources from the unified link menu', async ({ page, request }, testInfo) => {
  const baseName = `playwright-resource-image-${testInfo.workerIndex}-${Date.now()}`;
  const sourceVirtualPath = `/${baseName}.md`;
  const sourceDiskPath = path.join(knowledgeFixtureRoot, `${baseName}.md`);
  const referencesDir = path.join(knowledgeFixtureRoot, 'references');
  const resourceFileName = `${baseName}.png`;
  const resourceVirtualPath = `/references/${resourceFileName}`;
  const resourceDiskPath = path.join(referencesDir, resourceFileName);
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0n8AAAAASUVORK5CYII=',
    'base64'
  );

  await mkdir(referencesDir, { recursive: true });
  await writeFile(sourceDiskPath, 'See image', 'utf8');
  await writeFile(resourceDiskPath, pngBytes);

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.locator(`[data-path="${sourceVirtualPath}"]`).click();
    await openConversationTab(page);
    await page.locator('[data-testid="document-editor-surface"] .ProseMirror p').evaluate(() => {
      const paragraph = document.querySelector('[data-testid="document-editor-surface"] .ProseMirror p');
      const textNode = paragraph?.firstChild;
      if (!textNode) {
        return;
      }

      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(textNode, 4);
      range.setEnd(textNode, 9);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.getByTestId('markdown-insert-link').click();
    await page.getByTestId('markdown-link-tab-resource').click();
    await page.getByTestId(`markdown-resource-link-option-${resourceVirtualPath}`).click();
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('document-save').click();

    await expect.poll(async () => readContextText(request, sourceVirtualPath)).toBe(
      `See ![](references/${resourceFileName})`
    );
    await expect(page.locator(`[data-testid="document-editor-surface"] img[src*="document-asset?path=%2Freferences%2F${resourceFileName}"]`)).toHaveCount(1);
  } finally {
    await rm(sourceDiskPath, { force: true });
    await rm(resourceDiskPath, { force: true });
  }
});

test('web knowledge workspace resizes local markdown images from viewer mode and does not rewrite remote or ambiguous sources', async ({ page, request }, testInfo) => {
  const baseName = `playwright-resize-${testInfo.workerIndex}-${Date.now()}`;
  const resizableVirtualPath = `/${baseName}.md`;
  const ambiguousVirtualPath = `/${baseName}-ambiguous.md`;
  const resizableDiskPath = path.join(knowledgeFixtureRoot, `${baseName}.md`);
  const ambiguousDiskPath = path.join(knowledgeFixtureRoot, `${baseName}-ambiguous.md`);

  await writeFile(
    resizableDiskPath,
    [
      '# Resize target',
      '',
      '![Flow](images/flow.svg)',
      '',
      'After image.'
    ].join('\n'),
    'utf8'
  );
  await writeFile(
    ambiguousDiskPath,
    [
      '# Ambiguous target',
      '',
      '![Remote](https://example.com/flow.png)',
      '',
      '![First](images/flow.svg)',
      '![Second](images/flow.svg)'
    ].join('\n'),
    'utf8'
  );

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.locator(`[data-path="${resizableVirtualPath}"]`).click();
    await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    const resizableImage = page.locator('[data-testid="document-editor-surface"] img').first();
    const initialImageBox = await resizableImage.boundingBox();
    expect(initialImageBox).not.toBeNull();
    const resizeHandle = page.locator('[data-testid="markdown-image-resize-handle"]').first();
    await expect(resizeHandle).toBeVisible();
    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2 + 120, { steps: 8 });
    await page.mouse.up();
    const resizedImageBox = await resizableImage.boundingBox();
    expect(resizedImageBox).not.toBeNull();
    expect(resizedImageBox!.width).toBeGreaterThan(initialImageBox!.width + 20);
    await page.getByTestId('document-save').click();

    let resizedContent = '';
    await expect.poll(async () => {
      resizedContent = await readContextText(request, resizableVirtualPath);
      return resizedContent;
    }).toMatch(/!\[\d+\.\d+\]\(images\/flow\.svg\)/);
    const persistedRatio = Number(resizedContent.match(/!\[(\d+\.\d+)\]\(images\/flow\.svg\)/)?.[1] ?? '0');
    expect(persistedRatio).toBeGreaterThan(1);

    await page.getByTestId('markdown-mode-toggle').click();
    await expect(page.getByTestId('document-editor-input')).toHaveValue(/!\[\d+\.\d+\]\(images\/flow\.svg\)/);
    await page.getByTestId('markdown-mode-toggle').click();
    await expect(page.locator('[data-testid="document-editor-surface"] img')).toHaveCount(1);

    await page.locator(`[data-path="${ambiguousVirtualPath}"]`).click();
    await expect(page.locator('[data-testid="markdown-image-resize-handle"]')).toHaveCount(2);
    const ambiguousHandle = page.locator('[data-testid="markdown-image-resize-handle"]').first();
    const ambiguousBox = await ambiguousHandle.boundingBox();
    expect(ambiguousBox).not.toBeNull();
    await page.mouse.move(ambiguousBox!.x + ambiguousBox!.width / 2, ambiguousBox!.y + ambiguousBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(ambiguousBox!.x + ambiguousBox!.width / 2 + 80, ambiguousBox!.y + ambiguousBox!.height / 2, { steps: 6 });
    await page.mouse.up();

    await expect.poll(async () => readContextText(request, ambiguousVirtualPath)).toBe(
      [
        '# Ambiguous target',
        '',
        '![Remote](https://example.com/flow.png)',
        '',
        '![First](images/flow.svg)',
        '![Second](images/flow.svg)'
      ].join('\n')
    );
    expect(resizedContent).toMatch(/!\[\d+\.\d+\]\(images\/flow\.svg\)/);
  } finally {
    await rm(resizableDiskPath, { force: true });
    await rm(ambiguousDiskPath, { force: true });
  }
});

test('web knowledge workspace materializes pasted markdown images into references files', async ({ page, request }, testInfo) => {
  const baseName = `playwright-paste-${testInfo.workerIndex}-${Date.now()}`;
  const virtualPath = `/${baseName}.md`;
  const diskPath = path.join(knowledgeFixtureRoot, `${baseName}.md`);
  const referencesDir = path.join(knowledgeFixtureRoot, 'references');

  await writeFile(diskPath, 'Intro', 'utf8');

  let pastedFileDiskPath: string | null = null;

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.locator(`[data-path="${virtualPath}"]`).click();
    const surface = page.getByTestId('document-editor-surface');
    await surface.locator('.ProseMirror p').evaluate(() => {
      const paragraph = document.querySelector('[data-testid="document-editor-surface"] .ProseMirror p');
      const textNode = paragraph?.firstChild;
      if (!textNode) {
        return;
      }
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(textNode, 5);
      range.setEnd(textNode, 5);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await surface.evaluate((element) => {
      const input = element as HTMLElement;
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'pasted.png', { type: 'image/png' }));
      const event = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer
      });
      input.dispatchEvent(event);
    });
    await expect.poll(async () => readContextText(request, virtualPath)).toBe('Intro');
    await expect(page.getByTestId('document-editor')).toContainText('Intro');

    await page.getByTestId('document-save').click();
    let persistedContent = '';
    await expect.poll(async () => {
      persistedContent = await readContextText(request, virtualPath);
      return persistedContent;
    }).toMatch(/^Intro!\[\]\(references\/Pasted%20image%20\d{14}\.png\)$/);

    const pastedFileName = persistedContent.match(/^Intro!\[\]\(references\/(.+)\)$/)?.[1] ?? null;
    expect(pastedFileName).not.toBeNull();
    pastedFileDiskPath = pastedFileName ? path.join(referencesDir, decodeURIComponent(pastedFileName)) : null;
    const referencesFiles = await readdir(referencesDir);
    expect(referencesFiles).toContain(decodeURIComponent(pastedFileName!));
  } finally {
    await rm(diskPath, { force: true });
    if (pastedFileDiskPath) {
      await rm(pastedFileDiskPath, { force: true });
    }
  }
});

test('web knowledge workspace archives an agent conversation into a markdown document and keeps undo redo available', async ({ page, request }, testInfo) => {
  const fileName = `archive-e2e-${testInfo.workerIndex}-${Date.now()}.md`;
  const virtualPath = `/${fileName}`;
  const diskPath = path.join(knowledgeFixtureRoot, fileName);
  const initialContent = '# Playwright archive seed';

  await writeFile(diskPath, `${initialContent}\n`, 'utf8');

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.locator(`[data-path="${virtualPath}"]`).click();
    await openConversationTab(page);
    await expect(page.getByTestId('document-editor-input')).toBeVisible();
    await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();

    await page.getByTestId('agent-conversation-list-plus').click();
    await expect(page.getByTestId('normal-input')).toBeVisible();
    await page.getByTestId('normal-input').fill('Playwright archive prompt');
    await page.getByTestId('normal-send').click();
    await expect(page.getByTestId('normal-messages')).toContainText('Playwright archive prompt');

    await expect(page.getByTestId('agent-conversation-archive')).toBeVisible();
    await page.getByTestId('agent-conversation-archive').click();
    await expect(page.getByTestId('archive-feedback')).toContainText('Conversation archived into the current document.');
    await expect(page.getByTestId('archive-feedback')).toContainText('Added a missing *** divider automatically.');
    await expect(page.getByTestId('document-file-change')).toBeVisible();
    await expect(page.getByTestId('document-file-diff')).toContainText('Playwright archive prompt');

    let archivedContent = '';
    await expect.poll(async () => {
      archivedContent = await readContextText(request, virtualPath);
      return archivedContent;
    }).toContain('Playwright archive prompt');
    expect(archivedContent).toContain('***');

    await page.getByTestId('document-file-change-undo').click();
    await expect.poll(async () => readContextText(request, virtualPath)).toBe(`${initialContent}\n`);

    await page.getByTestId('document-file-change-redo').click();
    await expect.poll(async () => readContextText(request, virtualPath)).toBe(archivedContent);
    await expect(page.getByTestId('document-file-diff')).toContainText('Playwright archive prompt');

    await page.getByTestId('normal-input').fill('Playwright archive follow-up');
    await page.getByTestId('normal-send').click();
    await expect(page.getByTestId('normal-messages')).toContainText('Playwright archive follow-up');

    await page.reload();
    await expect(page.getByTestId('document-workspace')).toBeVisible();
    await page.getByTestId('topbar-workspace-normal-chat').click();
    await expect(page.getByTestId('conversation-workspace')).toBeVisible();
    await page.getByTestId('sidebar-toggle').click();
    await expect(page.getByTestId('local-history-item').filter({ hasText: 'Playwright archive prompt' })).toBeVisible();
  } finally {
    await rm(diskPath, { force: true });
  }
});

test('web knowledge workspace negotiates text pdf and unsupported document requests', async ({ page }) => {
  await page.goto('/#/');

  await expect(page.getByTestId('document-workspace')).toBeVisible();

  await page.getByTestId('document-node-file').filter({ hasText: 'notes.txt' }).click();
  await expect(page.getByTestId('document-editor-surface')).toBeVisible();
  await expect(page.getByTestId('document-save')).toBeEnabled();

  await page.locator('[data-path="/images"] .tree-toggle').click();
  await page.getByTestId('document-node-file').filter({ hasText: 'flow.svg' }).click();
  await expect(page.getByTestId('document-image-viewer')).toBeVisible();
  await expect(page.getByTestId('document-image-viewer').locator('img')).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml;base64,/
  );
  await expect(page.getByTestId('document-save')).toBeDisabled();
  await expect(page.getByTestId('markdown-mode-toggle')).toHaveCount(0);

  await page.getByTestId('document-node-file').filter({ hasText: 'report.pdf' }).click();
  await openConversationTab(page);
  await expect(page.getByTestId('document-pdf-viewer')).toBeVisible();
  await expect(page.getByTestId('document-save')).toBeDisabled();
  await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();
  await page.getByTestId('agent-conversation-list-plus').click();

  await page.getByTestId('normal-input').fill('TRIGGER_ATTACHMENT_ECHO');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).toContainText('report.pdf [application/pdf]');
  await expect(page.locator('.message.user .attachment-card')).toHaveCount(1);
  await expect(page.locator('.message.user').first()).toContainText('report.pdf');

  await page.getByTestId('normal-input').fill('第二轮继续问');
  await page.getByTestId('normal-send').click();
  await expect(page.locator('.message.user .attachment-card')).toHaveCount(1);
  await expect(page.locator('.message.user').last()).not.toContainText('report.pdf');

  await page.getByTestId('document-node-file').filter({ hasText: 'archive.bin' }).click();
  await openConversationTab(page);
  await expect(page.getByTestId('document-unsupported-viewer')).toContainText('application/octet-stream');
  await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();
  await page.getByTestId('agent-conversation-list-plus').click();

  await page.getByTestId('normal-input').fill('TRIGGER_ATTACHMENT_ECHO');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).not.toContainText('archive.bin [application/octet-stream]');
});

test('web knowledge workspace persists viewer edits for markdown documents with frontmatter', async ({ page, request }, testInfo) => {
  const baseName = `playwright-frontmatter-edit-${testInfo.workerIndex}-${Date.now()}`;
  const virtualPath = `/${baseName}.md`;
  const diskPath = path.join(knowledgeFixtureRoot, `${baseName}.md`);
  const siblingVirtualPath = `/${baseName}-other.md`;
  const siblingDiskPath = path.join(knowledgeFixtureRoot, `${baseName}-other.md`);
  const initialContent = [
    '---',
    'jarvis_id: frontmatter-test',
    '---',
    '# Frontmatter Test',
    '',
    'Body'
  ].join('\n');

  await writeFile(diskPath, initialContent, 'utf8');
  await writeFile(siblingDiskPath, '# Other Doc\n\nSibling', 'utf8');

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.locator(`[data-path="${virtualPath}"]`).click();
    const bodyParagraph = page.locator('[data-testid="document-editor-surface"] .ProseMirror p').last();
    await expect(bodyParagraph).toContainText('Body');
    await bodyParagraph.evaluate((paragraph) => {
      const textNode = paragraph.firstChild;
      if (!textNode) {
        return;
      }

      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(textNode, textNode.textContent?.length ?? 0);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.keyboard.type(' updated');

    await expect(page.getByTestId('document-save')).toHaveClass(/save-button--dirty/);
    await page.getByTestId('document-save').click();
    await expect.poll(async () => readContextText(request, virtualPath)).toContain('Body updated');

    await page.locator(`[data-path="${siblingVirtualPath}"]`).click();
    await page.locator(`[data-path="${virtualPath}"]`).click();

    const updatedParagraph = page.locator('[data-testid="document-editor-surface"] .ProseMirror p').last();
    await expect(updatedParagraph).toContainText('Body updated');
    await updatedParagraph.evaluate((paragraph) => {
      const textNode = paragraph.firstChild;
      if (!textNode) {
        return;
      }

      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(textNode, textNode.textContent?.length ?? 0);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.keyboard.type(' again');

    await expect(page.getByTestId('document-save')).toHaveClass(/save-button--dirty/);
    await page.getByTestId('document-save').click();
    await expect.poll(async () => readContextText(request, virtualPath)).toContain('Body updated again');

    await page.locator(`[data-path="${siblingVirtualPath}"]`).click();
    await page.locator(`[data-path="${virtualPath}"]`).click();
    await page.getByTestId('markdown-mode-toggle').click();
    await expect(page.getByTestId('document-editor-input')).toHaveValue(/Body updated again/);
  } finally {
    await rm(diskPath, { force: true });
    await rm(siblingDiskPath, { force: true });
  }
});

test('web knowledge workspace renders markdown mermaid and images while preserving mode switches', async ({ page }) => {
  await page.goto('/#/');

  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await page.locator('[data-path="/md-mermaid.md"]').click();

  const markdownModeToggle = page.getByTestId('markdown-mode-toggle');
  await expect(markdownModeToggle).toBeVisible();
  await expect(markdownModeToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(markdownModeToggle).toHaveAttribute('title', 'Source');
  await expect(page.getByTestId('document-editor')).toContainText('Normal Markdown paragraph for viewer mode.');
  await expect(page.getByTestId('markdown-mermaid-preview')).toBeVisible();
  const mermaidBlock = page.locator('.milkdown-code-block').filter({
    has: page.getByTestId('markdown-mermaid-preview')
  });
  await expect(mermaidBlock).not.toHaveAttribute('data-readonly-language', 'mermaid');
  await expect(mermaidBlock.locator('.tools')).toBeHidden();
  await expect(mermaidBlock.locator('.codemirror-host')).toBeHidden();
  await expect(page.getByTestId('markdown-mermaid-preview')).toHaveCSS('background-color', 'rgb(8, 13, 20)');
  await expect(page.getByTestId('markdown-mermaid-preview').locator('svg text')).toContainText([
    'Draft',
    'Preview'
  ]);
  await expect(page.locator('[data-testid="document-editor-surface"] img')).toHaveCount(1);
  await expect(page.locator('[data-testid="document-editor-surface"] img[src*=\"document-asset?path=%2Freferences%2Fflow.svg\"]')).toHaveCount(1);

  await markdownModeToggle.click();
  await expect(markdownModeToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(markdownModeToggle).toHaveAttribute('title', 'Render');
  await expect(page.getByTestId('document-editor-input')).toHaveValue(/classDiagram/);
  await expect(page.getByTestId('document-editor-input')).toHaveValue(/Draft --> Preview/);
  await expect(page.locator('.markdown-mermaid-preview')).toHaveCount(0);

  await markdownModeToggle.click();
  await expect(markdownModeToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(markdownModeToggle).toHaveAttribute('title', 'Source');
  await expect(page.getByTestId('document-editor')).toContainText('Normal Markdown paragraph for viewer mode.');
  await expect(page.getByTestId('markdown-mermaid-preview')).toBeVisible();
  await expect(page.locator('.milkdown-code-block').filter({
    has: page.getByTestId('markdown-mermaid-preview')
  })).not.toHaveAttribute('data-readonly-language', 'mermaid');
  await expect(page.locator('.milkdown-code-block').filter({
    has: page.getByTestId('markdown-mermaid-preview')
  }).locator('.tools')).toBeHidden();
  await expect(page.locator('.milkdown-code-block').filter({
    has: page.getByTestId('markdown-mermaid-preview')
  }).locator('.codemirror-host')).toBeHidden();
  await expect(page.locator('[data-testid="document-editor-surface"] img')).toHaveCount(1);
  await expect(page.locator('[data-testid="document-editor-surface"] img[src*=\"document-asset?path=%2Freferences%2Fflow.svg\"]')).toHaveCount(1);
});

test('web knowledge workspace shows markdown table source in edit mode', async ({ page }) => {
  await page.goto('/#/');

  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await page.locator('[data-path="/table-source.md"]').click();

  const markdownModeToggle = page.getByTestId('markdown-mode-toggle');
  await expect(markdownModeToggle).toBeVisible();
  await expect(markdownModeToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(markdownModeToggle).toHaveAttribute('title', 'Source');
  await expect(page.getByTestId('document-editor')).toContainText('Normal Markdown paragraph for table mode.');

  await markdownModeToggle.click();
  await expect(markdownModeToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(markdownModeToggle).toHaveAttribute('title', 'Render');
  await expect(page.getByTestId('document-editor-input')).toHaveValue(/\| Name\s+\| Type\s+\|/);
  await expect(page.getByTestId('document-editor-input')).toHaveValue(/\| id\s+\| string \|/);

  await markdownModeToggle.click();
  await expect(markdownModeToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(markdownModeToggle).toHaveAttribute('title', 'Source');

  await markdownModeToggle.click();
  await expect(markdownModeToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(markdownModeToggle).toHaveAttribute('title', 'Render');
  await expect(page.getByTestId('document-editor-input')).toHaveValue(/\| Name\s+\| Type\s+\|/);
  await expect(page.getByTestId('document-editor-input')).not.toHaveValue(/```cp-md-table/);
});

test('web knowledge workspace renders pdf wiki embeds as inline iframes', async ({ page }) => {
  await page.goto('/#/');

  await page.locator('[data-path="/pdf-embed.md"]').click();

  await expect(page.getByTestId('markdown-mode-toggle')).toBeVisible();
  await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('markdown-mode-toggle')).toHaveAttribute('title', 'Source');
  await expect(page.getByTestId('document-editor')).toContainText('Normal Markdown paragraph for same-directory PDF embed.');
  await expect(page.getByTestId('document-editor')).toContainText('Fallback PDF embed paragraph.');
  await expect(page.locator('[data-testid="document-editor-surface"] .markdown-pdf-embed__link')).toHaveCount(0);
  await expect(page.locator('[data-testid="document-editor-surface"] img')).toHaveCount(0);
  const pdfEmbeds = page.locator('[data-testid="document-editor-surface"] .markdown-pdf-embed object');
  await expect(pdfEmbeds).toHaveCount(2);
  const sameDirectoryPdfEmbed = pdfEmbeds.nth(0);
  const fallbackPdfEmbed = pdfEmbeds.nth(1);
  await expect(sameDirectoryPdfEmbed).toBeVisible();
  await expect(sameDirectoryPdfEmbed).toHaveAttribute(
    'data',
    /document-asset\?path=%2Freport\.pdf$/
  );
  await expect(fallbackPdfEmbed).toBeVisible();
  await expect(fallbackPdfEmbed).toHaveAttribute(
    'data',
    /document-asset\?path=%2Freferences%2FCustomer_Transactions_4047340\.pdf$/
  );
  const introParagraph = page.getByTestId('document-editor').getByText('Normal Markdown paragraph for same-directory PDF embed.');
  const fallbackParagraph = page.getByTestId('document-editor').getByText('Fallback PDF embed paragraph.');
  const trailingParagraph = page.getByTestId('document-editor').getByText('Trailing paragraph after PDF embed.');
  const introBox = await introParagraph.boundingBox();
  const sameDirectoryPdfBox = await sameDirectoryPdfEmbed.boundingBox();
  const fallbackParagraphBox = await fallbackParagraph.boundingBox();
  const fallbackPdfBox = await fallbackPdfEmbed.boundingBox();
  const trailingBox = await trailingParagraph.boundingBox();
  expect(introBox).not.toBeNull();
  expect(sameDirectoryPdfBox).not.toBeNull();
  expect(fallbackParagraphBox).not.toBeNull();
  expect(fallbackPdfBox).not.toBeNull();
  expect(trailingBox).not.toBeNull();
  expect(sameDirectoryPdfBox!.y).toBeGreaterThan(introBox!.y);
  expect(sameDirectoryPdfBox!.y).toBeLessThan(fallbackParagraphBox!.y);
  expect(fallbackPdfBox!.y).toBeGreaterThan(fallbackParagraphBox!.y);
  expect(fallbackPdfBox!.y).toBeLessThan(trailingBox!.y);
});

test('web knowledge workspace shows AgentView for owner directories and right-pane conversations', async ({ page }) => {
  await page.goto('/#/');

  const docsNode = page.locator('[data-path="/docs"]');
  await expect(docsNode).toBeVisible();
  await expect(docsNode.getByTestId('document-node-agent-owner')).toBeVisible();

  await docsNode.click();
  await expect(page.getByTestId('agent-view')).toBeVisible();
  await expect(page.getByTestId('agent-view-scope')).toContainText('/docs');
  await expect(page.getByTestId('agent-view')).toContainText('Docs Agent');
  await expect(page.getByTestId('agent-view-conversation')).toHaveCount(0);
  await expect(page.getByTestId('agent-view-document')).toHaveCount(0);
  await openConversationTab(page);
  await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();
  await expect(page.getByTestId('agent-document-conversation-empty')).toBeVisible();

  await page.getByTestId('agent-conversation-list-plus').click();
  await page.getByTestId('normal-input').fill('Docs owner conversation');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('agent-conversation-title')).toContainText('Docs owner conversation');
  await page.getByTestId('agent-conversation-back').click();
  await expect(page.getByTestId('agent-view-conversation')).toHaveCount(0);
  await expect(page.getByTestId('agent-document-conversation-item')).toContainText('Docs owner conversation');

  await docsNode.locator('.tree-toggle').click();
  await page.locator('[data-path="/docs/overview.md"]').click();
  await expect(page.getByTestId('document-editor-input')).toBeVisible();
  await expect(page.getByTestId('agent-view')).toHaveCount(0);

  await docsNode.click();
  await expect(page.getByTestId('agent-view')).toBeVisible();
  await openConversationTab(page);
  await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();
  await page.getByTestId('agent-document-conversation-item').click();
  await expect(page.getByTestId('normal-messages')).toContainText('Docs owner conversation');
  await page.getByTestId('agent-conversation-back').click();
  await expect(page.getByTestId('agent-document-conversation-item')).toContainText('Docs owner conversation');

  await page.locator('[data-path="/guide.md"]').click();
  await expect(page.getByTestId('agent-view')).toHaveCount(0);
});

test('web knowledge workspace edits AgentView prompt model and inheritance through real context writes', async ({ page, request }, testInfo) => {
  const ownerName = `agent-editor-${testInfo.workerIndex}-${Date.now()}`;
  const ownerPath = `/${ownerName}`;
  const childPath = `${ownerPath}/child`;
  const ownerDiskPath = path.join(knowledgeFixtureRoot, ownerName);
  const childDiskPath = path.join(ownerDiskPath, 'child');

  await mkdir(childDiskPath, { recursive: true });
  await writeFile(path.join(ownerDiskPath, '.agent.json'), `${JSON.stringify({
    name: 'E2E Parent Agent',
    description: 'Parent Agent Description',
    instructions: 'Parent inherited prompt',
    tools: [
      { id: 'read_file' },
      { id: 'search_in_scope' }
    ],
    modelProviderName: 'gemini-api',
    modelName: 'gemini-2.5-pro'
  }, null, 2)}\n`, 'utf8');
  await writeFile(path.join(ownerDiskPath, 'overview.md'), '# Agent Editor Overview\n', 'utf8');
  await writeFile(path.join(childDiskPath, '.agent.json'), `${JSON.stringify({
    name: 'E2E Child Agent',
    description: 'Child Agent Description',
    instructions: 'Child direct prompt'
  }, null, 2)}\n`, 'utf8');
  await writeFile(path.join(childDiskPath, 'child.md'), '# Child Agent Doc\n', 'utf8');

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    const ownerNode = page.locator(`[data-path="${ownerPath}"]`);
    await expect(ownerNode.getByTestId('document-node-agent-owner')).toBeVisible();
    await ownerNode.click();
    await expect(page.getByTestId('agent-view')).toBeVisible();
    await expect(page.getByTestId('agent-view-conversation')).toHaveCount(0);
    await expect(page.getByTestId('agent-view-document')).toHaveCount(0);

    await page.getByTestId('agent-view-instructions-toggle').click();
    await expect(page.getByTestId('agent-view-description')).toHaveValue('Parent Agent Description');
    await expect(page.getByTestId('agent-view-tool-read_file')).toBeChecked();
    await expect(page.getByTestId('agent-view-tool-search_in_scope')).toBeChecked();
    await page.getByTestId('agent-view-description').fill('Updated parent description from AgentView');
    await page.getByTestId('agent-view-prompt').fill('Updated parent prompt from AgentView');
    await page.getByTestId('agent-view-tool-search_in_scope').uncheck();
    await page.getByTestId('agent-view-tool-write_file').check();
    await page.getByTestId('agent-view-save').click();
    await expect.poll(async () => (await readContextJson(request, `${ownerPath}/.agent.json`)).description)
      .toBe('Updated parent description from AgentView');
    await expect.poll(async () => (await readContextJson(request, `${ownerPath}/.agent.json`)).instructions)
      .toBe('Updated parent prompt from AgentView');
    await expect.poll(async () => (await readContextJson(request, `${ownerPath}/.agent.json`)).tools)
      .toEqual([
        { id: 'read_current_file', description: 'Read the current active file from the knowledge workspace.' },
        { id: 'list_directory', description: 'List files and directories under a workspace directory. Use "." for the current agent root and "/" for the workspace root when allowed.' },
        { id: 'read_file', description: 'Read a file by path from the current knowledge workspace scope.' },
        { id: 'replace_text_in_file', description: 'Replace text in a workspace file by exact string matching.' },
        { id: 'replace_range_in_file', description: 'Replace a line and column range in a workspace file.' },
        { id: 'insert_text_in_file', description: 'Insert text at a specific line and column position in a workspace file.' },
        { id: 'delete_range_in_file', description: 'Delete a line and column range from a workspace file.' },
        { id: 'write_file', description: 'Create or overwrite a whole file in the workspace scope.' }
      ]);
    await expect(page.getByTestId('agent-view')).toContainText('Updated parent description from AgentView');
    await expect(page.getByTestId('agent-view-instructions')).toContainText('Updated parent prompt from AgentView');

    await page.getByTestId('agent-view-provider').selectOption('gemini-api');
    await page.getByTestId('agent-view-model-select').selectOption('gemini-2.5-flash');
    await page.getByTestId('agent-view-save').click();
    await expect.poll(async () => (await readContextJson(request, `${ownerPath}/.agent.json`)).modelProviderName)
      .toBe('gemini-api');
    await expect.poll(async () => (await readContextJson(request, `${ownerPath}/.agent.json`)).modelName)
      .toBe('gemini-2.5-flash');
    await expect(page.getByTestId('agent-view-model')).toContainText('gemini-api / gemini-2.5-flash');

    await ownerNode.locator('.tree-toggle').click();
    const childNode = page.locator(`[data-path="${childPath}"]`);
    await expect(childNode.getByTestId('document-node-agent-owner')).toBeVisible();
    await childNode.click();
    await expect(page.getByTestId('agent-view')).toContainText('E2E Child Agent');
    await expect(page.getByTestId('agent-view-model')).toContainText('gemini-api / gemini-2.5-flash');
    if (await page.getByTestId('agent-view-prompt').count() === 0) {
      await page.getByTestId('agent-view-instructions-toggle').click();
    }
    await expect(page.getByTestId('agent-view-prompt')).toHaveValue('Child direct prompt');
    await expect(page.getByTestId('agent-view-instructions')).toContainText('Updated parent prompt from AgentView');
    await expect(page.getByTestId('agent-view-instructions')).toContainText('Child direct prompt');
    await expect(page.getByTestId('agent-view-tool-read_current_file')).toBeChecked();
    await expect(page.getByTestId('agent-view-tool-read_file')).toBeChecked();
    await expect(page.getByTestId('agent-view-tool-write_file')).toBeChecked();
    await page.getByTestId('agent-view-tools-inherit').check();
    await expect(page.getByTestId('agent-view-tools-readonly')).toBeVisible();
    await expect(page.getByTestId('agent-view-tools-readonly')).toContainText('Read the current active file from the knowledge workspace.');
    await expect(page.getByTestId('agent-view-tools-readonly')).toContainText('Create or overwrite a whole file in the workspace scope.');
    await page.getByTestId('agent-view-tools-inherit').uncheck();
    await page.getByTestId('agent-view-tool-write_file').uncheck();
    await page.getByTestId('agent-view-tool-search_in_scope').check();
    await page.getByTestId('agent-view-save').click();
    await expect.poll(async () => (await readContextJson(request, `${childPath}/.agent.json`)).tools)
      .toEqual([
        { id: 'read_current_file', description: 'Read the current active file from the knowledge workspace.' },
        { id: 'list_directory', description: 'List files and directories under a workspace directory. Use "." for the current agent root and "/" for the workspace root when allowed.' },
        { id: 'read_file', description: 'Read a file by path from the current knowledge workspace scope.' },
        { id: 'search_in_scope', description: 'Search text matches inside the current agent scope.' },
        { id: 'replace_text_in_file', description: 'Replace text in a workspace file by exact string matching.' },
        { id: 'replace_range_in_file', description: 'Replace a line and column range in a workspace file.' },
        { id: 'insert_text_in_file', description: 'Insert text at a specific line and column position in a workspace file.' },
        { id: 'delete_range_in_file', description: 'Delete a line and column range from a workspace file.' }
      ]);

    await page.getByTestId('agent-view-inheritance').selectOption('override');
    await page.getByTestId('agent-view-save').click();
    await expect.poll(async () => (await readContextJson(request, `${childPath}/.agent.json`)).inheritance)
      .toBe('override');
    await expect(page.getByTestId('agent-view-model')).not.toContainText('gemini-api / gemini-2.5-flash');
    if (await page.getByTestId('agent-view-instructions').count() === 0) {
      await page.getByTestId('agent-view-instructions-toggle').click();
    }
    await expect(page.getByTestId('agent-view-instructions')).toContainText('Child direct prompt');
    await expect(page.getByTestId('agent-view-instructions')).not.toContainText('Updated parent prompt from AgentView');
  } finally {
    await rm(ownerDiskPath, { recursive: true, force: true });
  }
});

test('web knowledge workspace rename preserves linked conversation via stable document id', async ({ page, request }, testInfo) => {
  const baseName = `playwright-rename-id-${testInfo.workerIndex}-${Date.now()}`;
  const originalVirtualPath = `/${baseName}.md`;
  const renamedVirtualPath = `/${baseName}-renamed.md`;
  const originalDiskPath = path.join(knowledgeFixtureRoot, `${baseName}.md`);
  const renamedDiskPath = path.join(knowledgeFixtureRoot, `${baseName}-renamed.md`);

  await writeFile(originalDiskPath, '# Rename ID Test\n', 'utf8');
  // Pre-assign jarvis_id so the active document has documentId loaded from the start,
  // allowing the conversation to store documentIds immediately (no reload/migration needed).
  await request.post(`${contextApiBase}/get-document-id`, { data: { path: originalVirtualPath } });

  try {
    // Session 1: create a conversation linked to the document
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();
    await page.locator(`[data-path="${originalVirtualPath}"]`).click();
    // Wait for readDocument to complete so activeDocument.documentId is populated
    // before we create the conversation (avoids the race between readDocument and + click).
    await page.waitForTimeout(500);
    await openConversationTab(page);
    await page.getByTestId('agent-conversation-list-plus').click();
    await page.getByTestId('normal-input').fill('Conversation rename id test');
    await page.getByTestId('normal-send').click();
    await expect(page.getByTestId('agent-conversation-title')).toContainText('Conversation rename id test');
    await page.getByTestId('agent-conversation-back').click();
    await expect(page.getByTestId('agent-document-conversation-item')).toContainText('Conversation rename id test');

    // Session 2: reload to run the ID migration. Because jarvis_id is already in frontmatter
    // (pre-assigned above), migration immediately finds the ID and saves documentIds to the
    // conversation — no write to disk needed, making the migration race-free.
    await page.reload();
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    // Rename via double-click inline edit
    await page.locator(`[data-path="${originalVirtualPath}"]`).click();
    await page.locator(`[data-path="${originalVirtualPath}"]`).dblclick();
    await expect(page.getByTestId('document-rename-node-input')).toBeVisible();
    await page.getByTestId('document-rename-node-input').fill(`${baseName}-renamed`);
    await page.getByTestId('document-rename-node-input').press('Enter');

    // Navigate to renamed document and verify conversation is still linked via stable ID
    await expect(page.locator(`[data-path="${renamedVirtualPath}"]`)).toBeVisible();
    await page.locator(`[data-path="${renamedVirtualPath}"]`).click();
    await openConversationTab(page);
    // The conversation should appear in the list — proving ID-based lookup survives a rename
    await expect(page.getByTestId('agent-document-conversation-item')).toContainText('Conversation rename id test');
  } finally {
    await rm(originalDiskPath, { force: true });
    await rm(renamedDiskPath, { force: true });
  }
});

test('web knowledge workspace move preserves task association via stable document id', async ({ page, request }, testInfo) => {
  const baseName = `playwright-move-task-${testInfo.workerIndex}-${Date.now()}`;
  const docVirtualPath = `/${baseName}.md`;
  const targetDirVirtualPath = `/${baseName}-dir`;
  const movedVirtualPath = `/${baseName}-dir/${baseName}.md`;
  const docDiskPath = path.join(knowledgeFixtureRoot, `${baseName}.md`);
  const targetDirDiskPath = path.join(knowledgeFixtureRoot, `${baseName}-dir`);

  await writeFile(docDiskPath, '# Move Task Test\n', 'utf8');
  await mkdir(targetDirDiskPath, { recursive: true });
  await writeFile(path.join(targetDirDiskPath, '.gitkeep'), '', 'utf8');

  try {
    // Assign a jarvis_id via API so the task gets documentId at creation time
    await request.post(`${contextApiBase}/get-document-id`, { data: { path: docVirtualPath } });

    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    // Open document and create a task linked to it
    await page.locator(`[data-path="${docVirtualPath}"]`).click();
    await page.getByTestId('agent-right-pane-tab-tasks').click();
    await expect(page.getByTestId('agent-task-panel')).toBeVisible();
    await page.getByTestId('agent-task-add').click();
    await page.getByTestId('task-editor-title').fill('Task for move test');
    await page.getByTestId('task-editor-save').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText('Task for move test');

    // Drag file to target directory
    await page.locator(`[data-path="${docVirtualPath}"]`).dragTo(page.locator(`[data-path="${targetDirVirtualPath}"]`));
    await expect(page.getByTestId('move-confirm-message')).toBeVisible();
    await page.getByTestId('move-confirm-ok').click();

    // Verify file moved
    await expect.poll(async () => {
      try { return await readContextText(request, movedVirtualPath); } catch { return ''; }
    }).toContain('Move Task Test');

    // The moveNode action auto-expands the target directory, so the moved file
    // should be visible without manually toggling the directory.
    await expect(page.locator(`[data-path="${movedVirtualPath}"]`)).toBeVisible();
    await page.locator(`[data-path="${movedVirtualPath}"]`).click();
    await page.getByTestId('agent-right-pane-tab-tasks').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText('Task for move test');
  } finally {
    await rm(docDiskPath, { force: true });
    await rm(targetDirDiskPath, { recursive: true, force: true });
  }
});

test('web knowledge workspace move dialog warns about outgoing links and rewrites them on confirm', async ({ page, request }, testInfo) => {
  const baseName = `playwright-move-links-${testInfo.workerIndex}-${Date.now()}`;
  const sourceName = `${baseName}-source.md`;
  const targetName = `${baseName}-target.md`;
  const dirName = `${baseName}-dir`;
  const sourceVirtualPath = `/${sourceName}`;
  const targetVirtualPath = `/${targetName}`;
  const dirVirtualPath = `/${dirName}`;
  const movedVirtualPath = `/${dirName}/${sourceName}`;
  const sourceDiskPath = path.join(knowledgeFixtureRoot, sourceName);
  const targetDiskPath = path.join(knowledgeFixtureRoot, targetName);
  const dirDiskPath = path.join(knowledgeFixtureRoot, dirName);

  await writeFile(sourceDiskPath, `See [link](./${targetName})`, 'utf8');
  await writeFile(targetDiskPath, '# Target\n', 'utf8');
  await mkdir(dirDiskPath, { recursive: true });
  await writeFile(path.join(dirDiskPath, '.gitkeep'), '', 'utf8');

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    // Drag source document with an outgoing relative link to the directory
    await page.locator(`[data-path="${sourceVirtualPath}"]`).dragTo(page.locator(`[data-path="${dirVirtualPath}"]`));

    // Dialog should appear and show the link rewrite warning
    await expect(page.getByTestId('move-confirm-message')).toBeVisible();
    await expect(page.getByTestId('move-confirm-links-warning')).toBeVisible();

    // Confirm the move
    await page.getByTestId('move-confirm-ok').click();

    // Poll until the link is rewritten to the correct relative path (the write is async after the move)
    let movedContent = '';
    await expect.poll(async () => {
      try {
        movedContent = await readContextText(request, movedVirtualPath);
        return movedContent;
      } catch {
        return '';
      }
    }).toContain(`../${targetName}`);
    // Verify the original same-directory reference (./) is gone.
    // Use the full link syntax to avoid a false positive: '../foo' contains './foo' as a substring.
    expect(movedContent).not.toContain(`(./${targetName})`);

    // Source at original path should no longer exist
    const originalResponse = await request.post(`${contextApiBase}/read-document`, { data: { path: sourceVirtualPath } });
    expect(originalResponse.ok()).toBe(false);
  } finally {
    await rm(sourceDiskPath, { force: true });
    await rm(targetDiskPath, { force: true });
    await rm(dirDiskPath, { recursive: true, force: true });
  }
});

test('web knowledge workspace move dialog cancel leaves node at original path unchanged', async ({ page, request }, testInfo) => {
  const baseName = `playwright-move-cancel-${testInfo.workerIndex}-${Date.now()}`;
  const docVirtualPath = `/${baseName}.md`;
  const dirVirtualPath = `/${baseName}-dir`;
  const movedVirtualPath = `/${baseName}-dir/${baseName}.md`;
  const docDiskPath = path.join(knowledgeFixtureRoot, `${baseName}.md`);
  const dirDiskPath = path.join(knowledgeFixtureRoot, `${baseName}-dir`);

  await writeFile(docDiskPath, '# Cancel Move Test\n', 'utf8');
  await mkdir(dirDiskPath, { recursive: true });
  await writeFile(path.join(dirDiskPath, '.gitkeep'), '', 'utf8');

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    // Drag file to directory
    await page.locator(`[data-path="${docVirtualPath}"]`).dragTo(page.locator(`[data-path="${dirVirtualPath}"]`));
    await expect(page.getByTestId('move-confirm-message')).toBeVisible();

    // Cancel the move
    await page.getByTestId('move-confirm-cancel').click();
    await expect(page.getByTestId('move-confirm-message')).toHaveCount(0);

    // File should still exist at original path
    const originalContent = await readContextText(request, docVirtualPath);
    expect(originalContent).toContain('Cancel Move Test');

    // File should NOT be at new path
    const movedResponse = await request.post(`${contextApiBase}/read-document`, { data: { path: movedVirtualPath } });
    expect(movedResponse.ok()).toBe(false);
  } finally {
    await rm(docDiskPath, { force: true });
    await rm(dirDiskPath, { recursive: true, force: true });
  }
});

test('web knowledge workspace cross-agent drag shows blocking error dialog not confirmation', async ({ page, request }, testInfo) => {
  const baseName = `playwright-crossagent-${testInfo.workerIndex}-${Date.now()}`;
  const agentADir = `${baseName}-agent-a`;
  const agentBDir = `${baseName}-agent-b`;
  const agentAVirtualPath = `/${agentADir}`;
  const agentBVirtualPath = `/${agentBDir}`;
  const fileVirtualPath = `/${agentADir}/note.md`;
  const agentADiskPath = path.join(knowledgeFixtureRoot, agentADir);
  const agentBDiskPath = path.join(knowledgeFixtureRoot, agentBDir);

  await mkdir(agentADiskPath, { recursive: true });
  await mkdir(agentBDiskPath, { recursive: true });
  await writeFile(path.join(agentADiskPath, '.agent.json'), JSON.stringify({ name: `${baseName} Agent A` }, null, 2), 'utf8');
  await writeFile(path.join(agentADiskPath, 'note.md'), '# Agent A Note\n', 'utf8');
  await writeFile(path.join(agentBDiskPath, '.agent.json'), JSON.stringify({ name: `${baseName} Agent B` }, null, 2), 'utf8');
  // Sentinel file so agent-b shows as a drop target directory node
  await writeFile(path.join(agentBDiskPath, '.gitkeep'), '', 'utf8');

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    // Expand agent A to expose note.md
    const agentANode = page.locator(`[data-path="${agentAVirtualPath}"]`);
    await expect(agentANode).toBeVisible();
    await agentANode.locator('.tree-toggle').click();
    await expect(page.locator(`[data-path="${fileVirtualPath}"]`)).toBeVisible();

    // Drag note.md from agent A to agent B directory
    await page.locator(`[data-path="${fileVirtualPath}"]`).dragTo(page.locator(`[data-path="${agentBVirtualPath}"]`));

    // Should show blocking error dialog, NOT the move confirmation dialog
    await expect(page.getByTestId('move-error-message')).toBeVisible();
    await expect(page.getByTestId('move-confirm-message')).toHaveCount(0);

    // Dismiss error dialog
    await page.getByTestId('move-error-ok').click();
    await expect(page.getByTestId('move-error-message')).toHaveCount(0);

    // File should still be at original location in agent A
    const content = await readContextText(request, fileVirtualPath);
    expect(content).toContain('Agent A Note');
  } finally {
    await rm(agentADiskPath, { recursive: true, force: true });
    await rm(agentBDiskPath, { recursive: true, force: true });
  }
});

test('web knowledge workspace rename directory preserves linked conversation resolution', async ({ page, request }, testInfo) => {
  const baseName = `playwright-rename-dir-${testInfo.workerIndex}-${Date.now()}`;
  const originalDirName = `${baseName}-original`;
  const renamedDirName = `${baseName}-renamed`;
  const originalDirVirtualPath = `/${originalDirName}`;
  const renamedDirVirtualPath = `/${renamedDirName}`;
  const docInOriginalPath = `/${originalDirName}/doc.md`;
  const docInRenamedPath = `/${renamedDirName}/doc.md`;
  const originalDirDiskPath = path.join(knowledgeFixtureRoot, originalDirName);
  const renamedDirDiskPath = path.join(knowledgeFixtureRoot, renamedDirName);

  await mkdir(originalDirDiskPath, { recursive: true });
  await writeFile(path.join(originalDirDiskPath, 'doc.md'), '# Dir Rename Test\n', 'utf8');
  // Pre-assign jarvis_id so the document's stable ID is available when creating the conversation
  await request.post(`${contextApiBase}/get-document-id`, { data: { path: docInOriginalPath } });

  try {
    // Open document, create conversation linked to it (documentIds saved via documentId on activeDocument)
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();
    await page.locator(`[data-path="${originalDirVirtualPath}"]`).locator('.tree-toggle').click();
    await expect(page.locator(`[data-path="${docInOriginalPath}"]`)).toBeVisible();
    await page.locator(`[data-path="${docInOriginalPath}"]`).click();
    await openConversationTab(page);
    await page.getByTestId('agent-conversation-list-plus').click();
    await page.getByTestId('normal-input').fill('Conversation in renamed dir');
    await page.getByTestId('normal-send').click();
    await expect(page.getByTestId('agent-conversation-title')).toContainText('Conversation in renamed dir');
    await page.getByTestId('agent-conversation-back').click();
    await expect(page.getByTestId('agent-document-conversation-item')).toContainText('Conversation in renamed dir');

    // Rename the parent directory via double-click
    const originalDirNode = page.locator(`[data-path="${originalDirVirtualPath}"]`);
    await expect(originalDirNode).toBeVisible();
    await originalDirNode.dblclick();
    await expect(page.getByTestId('document-rename-node-input')).toBeVisible();
    await page.getByTestId('document-rename-node-input').fill(renamedDirName);
    await page.getByTestId('document-rename-node-input').press('Enter');

    // Navigate to document in renamed directory and verify conversation still linked via stable ID
    await expect(page.locator(`[data-path="${renamedDirVirtualPath}"]`)).toBeVisible();
    await page.locator(`[data-path="${renamedDirVirtualPath}"]`).locator('.tree-toggle').click();
    await expect(page.locator(`[data-path="${docInRenamedPath}"]`)).toBeVisible();
    await page.locator(`[data-path="${docInRenamedPath}"]`).click();
    await openConversationTab(page);
    await expect(page.getByTestId('agent-document-conversation-item')).toContainText('Conversation in renamed dir');
  } finally {
    await rm(originalDirDiskPath, { recursive: true, force: true });
    await rm(renamedDirDiskPath, { recursive: true, force: true });
  }
});

test('web knowledge workspace move rewrites pasted image link to remain valid at new location', async ({ page, request }, testInfo) => {
  const baseName = `playwright-move-image-${testInfo.workerIndex}-${Date.now()}`;
  const imageFileName = `Pasted image 20240101120000.png`;
  const virtualPath = `/${baseName}.md`;
  const dirVirtualPath = `/${baseName}-dir`;
  const movedVirtualPath = `/${baseName}-dir/${baseName}.md`;
  const diskPath = path.join(knowledgeFixtureRoot, `${baseName}.md`);
  const dirDiskPath = path.join(knowledgeFixtureRoot, `${baseName}-dir`);
  const referencesDir = path.join(knowledgeFixtureRoot, 'references');
  const imageDiskPath = path.join(referencesDir, imageFileName);

  // Pre-populate the document with an image link and create the image file —
  // this avoids the fragile clipboard API simulation and directly tests the
  // link-rewriting-on-move feature.
  await mkdir(referencesDir, { recursive: true });
  await writeFile(imageDiskPath, Buffer.from([137, 80, 78, 71]));
  const encodedImageName = encodeURIComponent(imageFileName);
  await writeFile(diskPath, `Intro\n\n![](references/${encodedImageName})`, 'utf8');
  await mkdir(dirDiskPath, { recursive: true });
  await writeFile(path.join(dirDiskPath, '.gitkeep'), '', 'utf8');

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    // Verify the file already has the image link (confirming our setup)
    const initialContent = await readContextText(request, virtualPath);
    expect(initialContent).toMatch(/!\[\]\(references\/Pasted%20image%20\d{14}\.png\)/);

    // Drag document to subdirectory — dialog should warn that the image link will be rewritten
    await page.locator(`[data-path="${virtualPath}"]`).dragTo(page.locator(`[data-path="${dirVirtualPath}"]`));
    await expect(page.getByTestId('move-confirm-message')).toBeVisible();
    await expect(page.getByTestId('move-confirm-links-warning')).toBeVisible();

    // Confirm the move
    await page.getByTestId('move-confirm-ok').click();

    // Verify moved file has the image link rewritten from `references/...` to `../references/...`
    let movedContent = '';
    await expect.poll(async () => {
      try {
        movedContent = await readContextText(request, movedVirtualPath);
      } catch {
        return '';
      }
      return movedContent;
    }).toMatch(/!\[\]\(\.\.\/references\/Pasted%20image%20\d{14}\.png\)/);

    // Original path must no longer exist
    const originalResponse = await request.post(`${contextApiBase}/read-document`, { data: { path: virtualPath } });
    expect(originalResponse.ok()).toBe(false);
  } finally {
    await rm(diskPath, { force: true });
    await rm(dirDiskPath, { recursive: true, force: true });
    await rm(imageDiskPath, { force: true });
  }
});
