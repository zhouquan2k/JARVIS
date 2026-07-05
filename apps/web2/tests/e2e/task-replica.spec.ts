import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';

const syncApiBaseUrl = 'http://127.0.0.1:8791/api/sync';
const syncKey = process.env.WEB2_E2E_SYNC_KEY?.trim() || 'web2-e2e';

type SyncTask = {
  id: string;
  title: string;
  notes: string;
  completed: boolean;
  dueAt: number | null;
  priority: 'low' | 'medium' | 'high' | null;
  executionState: 'doing' | 'morning' | 'afternoon' | 'evening' | null;
  documentPath: string | null;
  documentId: string | null;
  agentKey: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  calendarProviderId: string | null;
  calendarEventId: string | null;
  calendarSyncStatus: 'synced' | 'failed' | null;
  calendarLastSyncedAt: number | null;
  calendarLastSyncError: string | null;
  recurrence: 'daily' | 'weekly' | 'monthly' | null;
};

type DeletedTask = {
  id: string;
  updatedAt: number;
};

async function pushTasks(request: APIRequestContext, syncKey: string, tasks: SyncTask[], deletedTasks: DeletedTask[] = []): Promise<void> {
  const response = await request.post(`${syncApiBaseUrl}/tasks/push`, {
    headers: {
      'x-sync-key': syncKey
    },
    data: {
      tasks,
      deletedTasks
    }
  });
  expect(response.ok()).toBeTruthy();
}

async function pullTasks(request: APIRequestContext, syncKey: string): Promise<SyncTask[]> {
  const response = await request.post(`${syncApiBaseUrl}/tasks/pull`, {
    headers: {
      'x-sync-key': syncKey
    },
    data: {
      cursor: null
    }
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { tasks: SyncTask[] };
  return payload.tasks;
}

async function waitForTaskId(request: APIRequestContext, syncKey: string, title: string): Promise<string> {
  let matchedId: string | null = null;
  await expect.poll(async () => {
    const tasks = await pullTasks(request, syncKey);
    matchedId = tasks.find((task) => task.title === title)?.id ?? null;
    return matchedId;
  }).not.toBeNull();
  return matchedId!;
}

async function installOfflineTaskSyncRoutes(page: Page, offlineState: { enabled: boolean }): Promise<void> {
  const handleRoute = async (route: Route) => {
    if (offlineState.enabled) {
      await route.abort('internetdisconnected');
      return;
    }
    await route.continue();
  };

  await page.route('http://127.0.0.1:8791/api/sync/tasks/push', handleRoute);
  await page.route('http://127.0.0.1:8791/api/sync/tasks/pull', handleRoute);
}

test('web2 task views read from the replica offline and converge after reconnect', async ({ page, request }) => {
  const seedTime = Date.now();
  const todayTaskTitle = `Replica today ${seedTime}`;
  const plannedTaskTitle = `Replica planned ${seedTime}`;
  const editedTodayTaskTitle = `${todayTaskTitle} offline edited`;
  const todayDate = new Date();
  todayDate.setHours(9, 0, 0, 0);
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  tomorrowDate.setHours(9, 0, 0, 0);
  const todayDateInput = todayDate.toISOString().slice(0, 10);
  const tomorrowDateInput = tomorrowDate.toISOString().slice(0, 10);

  const offlineState = { enabled: false };
  let todayTaskId: string | null = null;
  let plannedTaskId: string | null = null;

  try {
    await installOfflineTaskSyncRoutes(page, offlineState);
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.locator('[data-testid="document-node-file"][data-path="/guide.md"]').click();
    await expect(page.getByTestId('workspace-right-pane-tab-tasks')).toHaveClass(/active/);
    await page.getByTestId('agent-task-add').click();
    await page.getByTestId('task-editor-title').fill(todayTaskTitle);
    await page.getByTestId('task-editor-due-at').fill(todayDateInput);
    await page.getByTestId('task-editor-save').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText(todayTaskTitle);

    todayTaskId = await waitForTaskId(request, syncKey, todayTaskTitle);

    await page.getByTestId('topbar-workspace-all-tasks').click();
    await expect(page.getByTestId('all-tasks-workspace')).toBeVisible();
    await expect(page.getByTestId('agent-task-open-list')).toContainText(todayTaskTitle);
    await page.getByTestId('all-tasks-shortcut-planned').click();
    await page.getByTestId('agent-task-add').click();
    await page.getByTestId('task-editor-title').fill(plannedTaskTitle);
    await page.getByTestId('task-editor-due-at').fill(tomorrowDateInput);
    await page.getByTestId('task-editor-save').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText(plannedTaskTitle);

    plannedTaskId = await waitForTaskId(request, syncKey, plannedTaskTitle);

    offlineState.enabled = true;

    await page.getByTestId('all-tasks-shortcut-today').click();
    await page.getByTestId(`agent-task-menu-${todayTaskId}`).click();
    await page.getByTestId(`agent-task-edit-${todayTaskId}`).click();
    await page.getByTestId('task-editor-title').fill(editedTodayTaskTitle);
    await page.getByTestId('task-editor-save').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText(editedTodayTaskTitle);

    await page.getByText(editedTodayTaskTitle, { exact: true }).click();
    await expect(page.getByTestId('document-workspace')).toBeVisible();
    await expect(page.getByTestId('agent-task-open-list')).toContainText(editedTodayTaskTitle);

    offlineState.enabled = false;
    await page.reload();

    await expect(page.getByTestId('document-workspace')).toBeVisible();
    await page.locator('[data-testid="document-node-file"][data-path="/guide.md"]').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText(editedTodayTaskTitle);

    await page.getByTestId('topbar-workspace-all-tasks').click();
    await expect(page.getByTestId('all-tasks-workspace')).toBeVisible();
    await page.getByTestId('all-tasks-shortcut-planned').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText(plannedTaskTitle);

    await expect.poll(async () => {
      const tasks = await pullTasks(request, syncKey);
      return tasks.find((task) => task.id === todayTaskId)?.title ?? null;
    }).toBe(editedTodayTaskTitle);
  } finally {
    const deletedTasks: DeletedTask[] = [];
    if (todayTaskId) {
      deletedTasks.push({ id: todayTaskId, updatedAt: Date.now() + 1_000 });
    }
    if (plannedTaskId) {
      deletedTasks.push({ id: plannedTaskId, updatedAt: Date.now() + 1_001 });
    }
    if (deletedTasks.length > 0) {
      await pushTasks(request, syncKey, [], deletedTasks);
    }
  }
});
