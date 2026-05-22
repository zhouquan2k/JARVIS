import { expect, test, type APIRequestContext } from '@playwright/test';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
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

async function readContextText(request: APIRequestContext, path: string) {
  const response = await request.post(`${contextApiBase}/read-document`, { data: { path } });
  const payload = await response.json();
  return Buffer.from(payload.document.dataBase64, 'base64').toString('utf8');
}

test('web knowledge workspace supports file browsing markdown editing diff undo redo and top-level workspace switching', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await expect(page.getByTestId('document-file-tree')).toBeVisible();
  await expect(page.getByTestId('agent-pane')).toBeVisible();
  await expect(page.getByTestId('agent-view')).toContainText('Default Knowledge Agent');
  await expect(page.getByTestId('agent-view-scope')).toContainText('/');
  await expect(page.getByTestId('document-node-root')).toHaveClass(/active/);
  await expect(page.getByTestId('document-editor')).toHaveCount(0);

  await page.locator('[data-path="/guide.md"]').click();
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

  await page.locator('[data-path="/guide.md"]').click();
  await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();
  await expect(page.getByTestId('agent-document-conversation-list')).not.toContainText('Notes linked conversation');

  await page.getByTestId('topbar-workspace-normal-chat').click();
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
});

test('web knowledge workspace preserves the shared conversation and restores the agent selection after chat mode switches', async ({ page }) => {
  await page.goto('/#/');

  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await page.locator('[data-path="/guide.md"]').click();
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

test('web knowledge workspace replaces New Chat for a new Agent conversation after the first send', async ({ page }) => {
  await page.goto('/#/');

  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await page.locator('[data-path="/guide.md"]').click();
  await page.getByTestId('agent-conversation-list-plus').click();
  await expect(page.getByTestId('agent-conversation-title')).toContainText('New Chat');

  await page.getByTestId('normal-input').fill('请帮我总结 guide 文档里的关键步骤和风险');
  await page.getByTestId('normal-send').click();
  await expect(page.getByTestId('agent-conversation-title')).not.toContainText('New Chat');

  await page.getByTestId('agent-conversation-back').click();
  await expect(page.getByTestId('agent-document-conversation-item').first()).not.toContainText('New Chat');
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
    await page.getByTestId('markdown-insert-conversation-link').click();
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
    await expect(page.getByTestId('document-editor-input')).toBeVisible();
    await expect(page.getByTestId('agent-document-conversation-list')).toBeVisible();

    await page.getByTestId('agent-conversation-list-plus').click();
    await expect(page.getByTestId('agent-conversation-toolbar')).toBeVisible();
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
