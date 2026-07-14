import { expect, test, type APIRequestContext } from '@playwright/test';

const syncApiBaseUrl = 'http://127.0.0.1:8791/api/sync';
const syncKey = process.env.WEB2_E2E_SYNC_KEY?.trim() || 'web2-e2e';

type SyncTask = {
  id: string;
  title: string;
};

type DeletedTask = {
  id: string;
  updatedAt: number;
};

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

async function pushDeletedTasks(request: APIRequestContext, syncKey: string, deletedTasks: DeletedTask[]): Promise<void> {
  const response = await request.post(`${syncApiBaseUrl}/tasks/push`, {
    headers: {
      'x-sync-key': syncKey
    },
    data: {
      tasks: [],
      deletedTasks
    }
  });
  expect(response.ok()).toBeTruthy();
}

test('web2 offline shell restores recent document, task replica, and local conversation after one online visit', async ({ page, request }) => {
  const seedTime = Date.now();
  const offlineTaskTitle = `PWA offline task ${seedTime}`;
  const offlinePrompt = `PWA offline prompt ${seedTime}`;
  let offlineTaskId: string | null = null;

  try {
    await page.goto('/#/');
    await expect(page.getByTestId('document-workspace')).toBeVisible();

    await page.locator('[data-testid="document-node-file"][data-path="/guide.md"]').click();
    await expect(page.getByTestId('document-editor')).toBeVisible();
    await expect(page.getByTestId('document-editor-title')).toHaveText('guide');
    await expect(page.getByTestId('document-editor')).toContainText('Playwright knowledge web');

    await page.getByTestId('agent-task-add').click();
    await page.getByTestId('task-editor-title').fill(offlineTaskTitle);
    await page.getByTestId('task-editor-save').click({ force: true });
    await expect(page.getByTestId('agent-task-open-list')).toContainText(offlineTaskTitle);
    offlineTaskId = await waitForTaskId(request, syncKey, offlineTaskTitle);

    await page.getByTestId('topbar-workspace-normal-chat').click();
    await expect(page.getByTestId('normal-chat-view')).toBeVisible();
    await page.getByTestId('normal-input').fill(offlinePrompt);
    await page.getByTestId('normal-send').click();
    await expect(page.getByTestId('normal-chat-view')).toContainText(offlinePrompt);

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(async () => page.evaluate(() => Boolean(navigator.serviceWorker?.controller))).toBe(true);
    await expect(page.getByTestId('normal-chat-view')).toBeVisible();

    await page.context().setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('normal-chat-view')).toBeVisible();
    await expect(page.getByTestId('normal-chat-view')).toContainText(offlinePrompt);

    await page.getByTestId('workspace-restore').click();
    await expect(page.getByTestId('document-workspace')).toBeVisible();
    await page.locator('[data-testid="document-node-file"][data-path="/guide.md"]').click();

    await expect(page.getByTestId('document-editor-title')).toHaveText('guide');
    await expect(page.getByTestId('document-editor')).toContainText('Playwright knowledge web');
    await page.getByTestId('workspace-right-pane-tab-tasks').click();
    await expect(page.getByTestId('agent-task-open-list')).toContainText(offlineTaskTitle);
    await expect(page.getByTestId('document-readonly-banner')).toBeVisible();
    await expect(page.getByTestId('document-save')).toBeDisabled();
  } finally {
    if (offlineTaskId) {
      await pushDeletedTasks(request, syncKey, [{
        id: offlineTaskId,
        updatedAt: Date.now() + 1_000
      }]);
    }
  }
});
