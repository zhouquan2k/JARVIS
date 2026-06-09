import { expect, test } from '@playwright/test';

test('web2 boots workspace with default task surfaces enabled', async ({ page }) => {
  await page.goto('/#/');

  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await expect(page.getByTestId('document-file-tree')).toBeVisible();
  await expect(page.getByTestId('workspace-right-pane')).toBeVisible();
  await expect(page.getByTestId('topbar-workspace-normal-chat')).toBeVisible();
  await expect(page.getByTestId('topbar-workspace-all-tasks')).toHaveCount(1);
  await expect(page.getByTestId('workspace-right-pane-tab-tasks')).toHaveCount(1);

  await page.getByTestId('topbar-workspace-normal-chat').click();
  await expect(page.getByTestId('conversation-workspace')).toBeVisible();
  await expect(page.getByTestId('normal-chat-view')).toBeVisible();
});

test('web2 all-tasks supports inline editing, today defaults, execution ordering, and workspace navigation', async ({ page, request }) => {
  const documentTaskId = `doc-task-${Date.now()}`;
  const documentTaskTitle = `Doc task ${Date.now()}`;
  const globalTodayTaskTitle = `Today task ${Date.now()}`;
  const todayDateOnly = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 0, 0, 0, 0).getTime();

  await page.goto('/#/');
  const createDocumentTaskResponse = await request.post('http://127.0.0.1:8791/api/context/create-task', {
    data: {
      task: {
        id: documentTaskId,
        title: documentTaskTitle,
        notes: 'Prepare summary',
        completed: false,
        dueAt: todayDateOnly,
        priority: null,
        executionState: null,
        documentPath: '/guide.md',
        documentId: null,
        agentKey: '/',
        createdAt: 0,
        updatedAt: 0,
        completedAt: null,
        calendarProviderId: null,
        calendarEventId: null,
        calendarSyncStatus: null,
        calendarLastSyncedAt: null,
        calendarLastSyncError: null
      }
    }
  });
  expect(createDocumentTaskResponse.ok()).toBeTruthy();
  const { task: createdDocumentTask } = await createDocumentTaskResponse.json() as { task: { id: string } };

  await page.getByTestId('topbar-workspace-all-tasks').click();
  await expect(page.getByTestId('all-tasks-workspace')).toBeVisible();
  await expect(page.getByTestId('agent-task-open-list')).toContainText(documentTaskTitle);

  await page.getByTestId('agent-task-add').click();
  await page.getByTestId('task-editor-title').fill(globalTodayTaskTitle);
  await page.getByTestId('task-editor-save').click();

  const todayRow = page.locator('[data-testid^="agent-task-item-"]').filter({ hasText: globalTodayTaskTitle }).first();
  await expect(todayRow).toContainText(globalTodayTaskTitle);
  await expect(todayRow).toContainText(/\d{2}\/\d{2}(?!\s\d{2}:\d{2})/);

  const documentRow = page.getByTestId(`agent-task-item-${createdDocumentTask.id}`);
  await page.getByTestId(`agent-task-menu-${createdDocumentTask.id}`).click();
  await page.getByTestId(`agent-task-edit-${createdDocumentTask.id}`).click();
  await page.getByTestId('task-editor-execution-state').selectOption('doing');
  await page.getByTestId('task-editor-save').click();

  await expect(page.getByTestId('agent-task-open-list')).toContainText(documentTaskTitle);
  await expect(documentRow).toContainText(documentTaskTitle);
  await expect(documentRow).toContainText('Doing');

  await page.getByText(documentTaskTitle, { exact: true }).click();

  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await expect(page.getByTestId('workspace-right-pane-tab-tasks')).toHaveClass(/active/);
  await expect(page.locator('[data-testid="document-node-file"][data-path="/guide.md"]')).toHaveClass(/active/);
});
