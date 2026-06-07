import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const contextApiBaseUrl = 'http://127.0.0.1:8791/api/context';

function decodeTextDocument(dataBase64: string): string {
  return Buffer.from(dataBase64, 'base64').toString('utf8');
}

async function readDocumentText(request: APIRequestContext, path: string): Promise<string | null> {
  const response = await request.post(`${contextApiBaseUrl}/read-document`, {
    data: { path }
  });
  if (!response.ok()) {
    return null;
  }

  const payload = await response.json() as {
    document?: {
      dataBase64?: string;
    };
  };
  const dataBase64 = payload.document?.dataBase64;
  return typeof dataBase64 === 'string' ? decodeTextDocument(dataBase64) : null;
}

async function deleteNode(request: APIRequestContext, path: string): Promise<void> {
  await request.post(`${contextApiBaseUrl}/delete-node`, {
    data: { path }
  });
}

async function openImportWizard(page: Page): Promise<void> {
  await page.goto('/#/');
  await expect(page.getByTestId('document-workspace')).toBeVisible();
  await page.locator('[data-testid="document-node-directory"][data-path="/docs"]').click();
  await page.getByTestId('document-import').click();
  await expect(page.getByTestId('import-step-source')).toBeVisible();
  await page.getByTestId('import-source-bilibili-video').click();
  await page.getByTestId('import-wizard-next').click();
  await expect(page.getByTestId('import-step-configure')).toBeVisible();
  await page.getByTestId('import-target-directory').selectOption('/docs');
}

test('web2 imports a bilibili transcript as a normal document', async ({ page, request }) => {
  const title = `web2-transcript-${Date.now()}`;
  const documentPath = `/docs/${title}.md`;

  await page.route('http://127.0.0.1:8791/api/import/bilibili', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        title: 'Ignored Remote Title',
        transcript: '第一段\n第二段'
      })
    });
  });

  try {
    await openImportWizard(page);
    await page.getByTestId('bilibili-import-url').fill('https://www.bilibili.com/video/BV1xx411c7mD');
    await page.getByTestId('bilibili-import-title').fill(title);
    await page.getByTestId('import-wizard-next').click();

    await expect(page.getByTestId('import-wizard-close')).toHaveCount(0);
    await expect(page.getByTestId('document-editor')).toBeVisible();
    await expect.poll(async () => readDocumentText(request, documentPath)).toContain('## Transcript');
    await expect.poll(async () => readDocumentText(request, documentPath)).toContain('> Source: https://www.bilibili.com/video/BV1xx411c7mD');
  } finally {
    await deleteNode(request, documentPath);
  }
});

test('web2 imports a bilibili transcript plus summary into a summary doc and references transcript resource', async ({ page, request }) => {
  const title = `web2-summary-${Date.now()}`;
  const documentPath = `/docs/${title}.md`;
  const transcriptPath = `/docs/references/${title}-transcript.md`;

  await page.route('http://127.0.0.1:8791/api/import/bilibili', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        title: 'Ignored Remote Title',
        transcript: '字幕第一段\n字幕第二段'
      })
    });
  });

  try {
    await openImportWizard(page);
    await page.getByTestId('bilibili-import-url').fill('https://www.bilibili.com/video/BV1xx411c7mD');
    await page.getByTestId('bilibili-import-title').fill(title);
    await page.getByTestId('bilibili-import-summary').check();
    await page.getByTestId('import-wizard-next').click();

    await expect(page.getByTestId('import-wizard-close')).toHaveCount(0);
    await expect(page.getByTestId('document-editor')).toBeVisible();
    await expect.poll(async () => readDocumentText(request, documentPath)).toContain('## Summary');
    await expect.poll(async () => readDocumentText(request, documentPath)).toContain(`references/${title}-transcript.md`);
    await expect.poll(async () => readDocumentText(request, transcriptPath)).toContain('## Transcript');
    await expect.poll(async () => readDocumentText(request, transcriptPath)).toContain('字幕第一段');
  } finally {
    await deleteNode(request, transcriptPath);
    await deleteNode(request, documentPath);
    await deleteNode(request, '/docs/references');
  }
});

test('web2 keeps the wizard open and shows stage-specific failure reporting when bilibili transcript fetching fails', async ({ page }) => {
  await page.route('http://127.0.0.1:8791/api/import/bilibili', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'yt-dlp missing subtitles'
      })
    });
  });

  await openImportWizard(page);
  await page.getByTestId('bilibili-import-url').fill('https://www.bilibili.com/video/BV1xx411c7mD');
  await page.getByTestId('bilibili-import-title').fill(`web2-failure-${Date.now()}`);
  await page.getByTestId('import-wizard-next').click();

  await expect(page.getByTestId('import-step-execute')).toBeVisible();
  await expect(page.getByText('抓取文字稿')).toBeVisible();
  await expect(page.getByTestId('import-stage-error')).toContainText('yt-dlp missing subtitles');
  await expect(page.locator('.import-stage-row--failed')).toContainText('yt-dlp missing subtitles');
  await expect(page.getByTestId('import-wizard-close')).toBeVisible();
});
