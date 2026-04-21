import { expect, test, type APIRequestContext } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const contextApiBase = 'http://127.0.0.1:8790/api/context';
const testDir = path.dirname(fileURLToPath(import.meta.url));
const knowledgeFixtureRoot = path.resolve(testDir, '../../../server/tests/fixtures/knowledge-workspace');

async function readContextJson(request: APIRequestContext, path: string) {
  const response = await request.post(`${contextApiBase}/read-document`, { data: { path } });
  const payload = await response.json();
  return JSON.parse(Buffer.from(payload.document.dataBase64, 'base64').toString('utf8'));
}

test('web knowledge workspace supports file browsing markdown editing diff undo redo and top-level workspace switching', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await expect(page.getByTestId('document-file-tree')).toBeVisible();
  await expect(page.getByTestId('document-editor')).toBeVisible();
  await expect(page.getByTestId('agent-pane')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
  await expect(page.getByTestId('agent-name')).toContainText('Default Knowledge Agent（/）');
  await expect(page.getByTestId('document-node-root')).toHaveClass(/active/);
  await expect(page.getByTestId('document-editor-empty')).toBeVisible();

  await page.getByTestId('document-node-file').filter({ hasText: 'guide.md' }).click();
  await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();
  await expect(page.getByTestId('agent-document-conversation-empty')).toBeVisible();
  const editor = page.getByTestId('document-editor-input');
  await expect(editor).toBeVisible();
  await editor.fill('Playwright knowledge web');
  await page.getByTestId('document-save').click();

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
  await expect(page.getByTestId('document-file-change')).toBeVisible();
  await expect(page.getByTestId('document-file-diff')).toContainText('Playwright knowledge web updated by agent');

  await page.getByTestId('document-file-change-undo').click();
  await expect(page.getByTestId('document-file-change-redo')).toBeEnabled();
  await expect(page.getByTestId('document-file-diff')).toContainText('Playwright knowledge web');

  await page.getByTestId('document-file-change-redo').click();
  await expect(page.getByTestId('document-file-diff')).toContainText('updated by agent');

  await page.getByTestId('agent-conversation-back').click();
  await page.getByTestId('document-node-file').filter({ hasText: 'notes.txt' }).click();
  await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();
  await expect(page.getByTestId('agent-document-conversation-empty')).toBeVisible();
  await page.getByTestId('agent-conversation-list-plus').click();
  await page.getByTestId('normal-input').fill('Notes linked conversation');
  await page.getByTestId('normal-send').click();
  await page.getByTestId('agent-conversation-back').click();
  await expect(page.getByTestId('agent-document-conversation-item')).toContainText('Notes linked conversation');

  await page.getByTestId('document-node-file').filter({ hasText: 'guide.md' }).click();
  await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();
  await expect(page.getByTestId('agent-document-conversation-list')).not.toContainText('Notes linked conversation');

  await page.getByTestId('topbar-workspace-normal-chat').click();
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
});

test('web knowledge workspace preserves the shared conversation and restores the agent selection after chat mode switches', async ({ page }) => {
  await page.goto('/#/');

  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await page.getByTestId('document-node-file').filter({ hasText: 'guide.md' }).click();
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
  await expect(page.getByTestId('agent-conversation-toolbar')).toBeVisible();
  await expect(page.getByTestId('agent-conversation-title')).toContainText('Shared agent conversation');
  await expect(page.getByTestId('agent-document-conversation-list')).toHaveCount(0);
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
  await expect(page.getByTestId('markdown-mode-switch')).toHaveCount(0);

  await page.getByTestId('document-node-file').filter({ hasText: 'report.pdf' }).click();
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
  await expect(page.getByTestId('document-unsupported-viewer')).toContainText('application/octet-stream');
  await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();
  await page.getByTestId('agent-conversation-list-plus').click();

  await page.getByTestId('normal-input').fill('TRIGGER_ATTACHMENT_ECHO');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('normal-messages')).not.toContainText('archive.bin [application/octet-stream]');
});

test('web knowledge workspace renders markdown mermaid and images while preserving mode switches', async ({ page }) => {
  await page.goto('/#/');

  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await page.getByTestId('document-node-file').filter({ hasText: 'md-mermaid.md' }).click();

  await expect(page.getByTestId('markdown-mode-switch')).toBeVisible();
  await expect(page.getByTestId('markdown-mode-viewer')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('markdown-mode-viewer')).toHaveText('View');
  await expect(page.getByTestId('markdown-mode-edit')).toHaveText('Edit');
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

  await page.getByTestId('markdown-mode-edit').click();
  await expect(page.getByTestId('markdown-mode-edit')).toHaveAttribute('aria-pressed', 'true');
  const editMermaidBlock = page.locator('.milkdown-code-block').filter({
    hasText: 'classDiagram'
  });
  await expect(editMermaidBlock).toHaveAttribute('data-readonly-language', 'mermaid');
  await expect(page.getByTestId('document-editor-input')).toContainText('classDiagram');
  await expect(page.getByTestId('document-editor-input')).toContainText('Draft --> Preview');
  await expect(page.locator('.markdown-mermaid-preview')).toHaveCount(0);

  await page.getByTestId('markdown-mode-viewer').click();
  await expect(page.getByTestId('markdown-mode-viewer')).toHaveAttribute('aria-pressed', 'true');
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

test('web knowledge workspace renders pdf wiki embeds as inline iframes', async ({ page }) => {
  await page.goto('/#/');

  await page.getByTestId('document-node-file').filter({ hasText: 'pdf-embed.md' }).click();

  await expect(page.getByTestId('markdown-mode-switch')).toBeVisible();
  await expect(page.getByTestId('markdown-mode-viewer')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('markdown-mode-viewer')).toHaveText('View');
  await expect(page.getByTestId('document-editor')).toContainText('Normal Markdown paragraph for PDF viewer fallback.');
  await expect(page.locator('[data-testid="document-editor-surface"] img')).toHaveCount(0);
  const pdfEmbed = page.locator('[data-testid="document-editor-surface"] .pdf-inline-embed iframe');
  await expect(pdfEmbed).toBeVisible();
  await expect(pdfEmbed).toHaveAttribute(
    'src',
    /document-asset\?path=%2Freferences%2FCustomer_Transactions_4047340\.pdf$/
  );
});

test('web knowledge workspace shows AgentView for owner directories and right-pane conversations', async ({ page }) => {
  await page.goto('/#/');

  const docsNode = page.locator('[data-path="/docs"]');
  await expect(docsNode).toBeVisible();
  await expect(docsNode.getByTestId('document-node-agent-owner')).toBeVisible();

  await docsNode.click();
  await expect(page.getByTestId('agent-view')).toBeVisible();
  await expect(page.getByTestId('agent-view-scope')).toContainText('/docs');
  await expect(page.getByTestId('agent-name')).toContainText('Docs Agent');
  await expect(page.getByTestId('agent-view-conversation')).toHaveCount(0);
  await expect(page.getByTestId('agent-view-document')).toHaveCount(0);
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
  await page.getByTestId('document-node-file').filter({ hasText: 'overview.md' }).click();
  await expect(page.getByTestId('document-editor-input')).toBeVisible();
  await expect(page.getByTestId('agent-view')).toHaveCount(0);

  await docsNode.click();
  await expect(page.getByTestId('agent-view')).toBeVisible();
  await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();
  await page.getByTestId('agent-document-conversation-item').click();
  await expect(page.getByTestId('normal-messages')).toContainText('Docs owner conversation');
  await page.getByTestId('agent-conversation-back').click();
  await expect(page.getByTestId('agent-document-conversation-item')).toContainText('Docs owner conversation');

  await page.getByTestId('document-node-file').filter({ hasText: 'guide.md' }).click();
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
    await expect(page.getByTestId('agent-view-save')).toBeDisabled();
    await expect.poll(async () => (await readContextJson(request, `${ownerPath}/.agent.json`)).description)
      .toBe('Updated parent description from AgentView');
    await expect.poll(async () => (await readContextJson(request, `${ownerPath}/.agent.json`)).instructions)
      .toBe('Updated parent prompt from AgentView');
    await expect.poll(async () => (await readContextJson(request, `${ownerPath}/.agent.json`)).tools)
      .toEqual([
        { id: 'read_current_file', description: 'Read the current active file from the knowledge workspace.' },
        { id: 'list_directory', description: 'List files and directories under a workspace directory.' },
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
    await expect(page.getByTestId('agent-model')).toContainText('gemini-api / gemini-2.5-flash');

    await ownerNode.locator('.tree-toggle').click();
    const childNode = page.locator(`[data-path="${childPath}"]`);
    await expect(childNode.getByTestId('document-node-agent-owner')).toBeVisible();
    await childNode.click();
    await expect(page.getByTestId('agent-name')).toContainText('E2E Child Agent');
    await expect(page.getByTestId('agent-model')).toContainText('gemini-api / gemini-2.5-flash');
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
        { id: 'list_directory', description: 'List files and directories under a workspace directory.' },
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
    await expect(page.getByTestId('agent-model')).not.toContainText('gemini-api / gemini-2.5-flash');
    if (await page.getByTestId('agent-view-instructions').count() === 0) {
      await page.getByTestId('agent-view-instructions-toggle').click();
    }
    await expect(page.getByTestId('agent-view-instructions')).toContainText('Child direct prompt');
    await expect(page.getByTestId('agent-view-instructions')).not.toContainText('Updated parent prompt from AgentView');
  } finally {
    await rm(ownerDiskPath, { recursive: true, force: true });
  }
});
