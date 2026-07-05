import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import * as coreConfig from '../../../packages/core/config.ts';
import { FileSystemContextProvider } from '@packages/node';
import { createDatabase, type SyncDatabase } from './db.js';
import { resolveServerConfig, type ServerConfig } from './config.js';
import { createCodexRouter } from './routes/codex.js';
import { createContextRouter } from './routes/context.js';
import { createHealthRouter } from './routes/health.js';
import { createImportRouter } from './routes/import.js';
import { createProviderConfigRouter } from './routes/providerConfigs.js';
import { createSyncRouter } from './routes/sync.js';
import { DatabaseContextProvider } from './providers/databaseContextProvider.js';
import { SyncRepository } from './repositories/syncRepository.js';
import { CodexAuthService } from './services/codexAuthService.js';
import { CodexCliService } from './services/codexCliService.js';
import { BilibiliTranscriptService } from './services/BilibiliTranscriptService.js';
import { GoogleCalendarSyncService } from './services/GoogleCalendarSyncService.js';
import { HttpContextService } from './services/httpContextService.js';
import type { ITaskCalendarSyncService } from './services/ITaskCalendarSyncService.js';
import { ServerTaskService } from './services/serverTaskService.js';
import { SyncService } from './services/syncService.js';
import type { ContextProvider } from './types/context.js';
import type { TaskService } from '@plugins/task-mgr/api';
import { normalizeTaskRecord } from './types/sync.js';

const { DEFAULT_SYNC_KEY } = coreConfig;

export interface CreateAppOptions {
    config?: ServerConfig;
    database?: SyncDatabase;
    contextProvider?: ContextProvider;
    taskService?: TaskService;
    bilibiliTranscriptService?: Pick<BilibiliTranscriptService, 'fetch'>;
}

function createContextProvider(config: ServerConfig, repository: SyncRepository): ContextProvider {
    if (config.contextBackend === 'database') {
        return new DatabaseContextProvider();
    }

    const hasCalendarSyncConfig = Boolean(createTaskCalendarSyncService());
    const calendarId = normalizeEnvValue(process.env.CHATPRISM_GOOGLE_CALENDAR_ID) || 'primary';
    console.info('[sync-server] creating local-file context provider', {
        knowledgeRoot: config.knowledgeRoot,
        calendarSyncEnabled: hasCalendarSyncConfig,
        calendarId
    });

    return Object.assign(
        new FileSystemContextProvider({
            rootPath: config.knowledgeRoot
        }),
        {
            getConversations: repository.getConversations.bind(repository)
        }
    );
}

async function runDocumentIdMigration(
    provider: ContextProvider,
    repository: SyncRepository,
    knowledgeRoot: string
): Promise<void> {
    const metaPath = path.join(knowledgeRoot, '.jarvis-meta.json');
    try {
        const raw = await fs.readFile(metaPath, 'utf8');
        const meta = JSON.parse(raw) as Record<string, unknown>;
        if (meta.migrateNeeded === false) {
            return;
        }
    } catch {
        // file absent or invalid — treat as migrateNeeded=true
    }

    try {
        await provider.initializeAccess();
    } catch (err) {
        console.warn('[document-id-migration] initializeAccess failed, skipping migration:', err);
        return;
    }

    const rows = repository.getConversationsNeedingMigration();
    let migrated = 0;
    for (const { syncKey, conversationId, documentPaths } of rows) {
        const ids: string[] = [];
        for (const docPath of documentPaths) {
            try {
                ids.push(await provider.getDocumentId(docPath));
            } catch {
                // path no longer exists or provider error — skip
            }
        }
        if (ids.length > 0) {
            repository.setConversationDocumentIds(syncKey, conversationId, ids);
            migrated++;
        }
    }

    try {
        const latestMeta = await readJarvisMeta(metaPath);
        await writeJarvisMeta(metaPath, {
            ...latestMeta,
            migrateNeeded: false
        });
        console.info(`[document-id-migration] Complete. Migrated ${migrated}/${rows.length} conversations.`);
    } catch (err) {
        console.warn('[document-id-migration] Failed to write .jarvis-meta.json:', err);
    }
}

async function readJarvisMeta(metaPath: string): Promise<Record<string, unknown>> {
    try {
        const raw = await fs.readFile(metaPath, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // ignore missing or invalid meta
    }

    return {};
}

async function writeJarvisMeta(metaPath: string, meta: Record<string, unknown>): Promise<void> {
    await fs.mkdir(path.dirname(metaPath), { recursive: true });
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
}

async function runTaskSyncMigration(
    knowledgeRoot: string,
    syncKey: string,
    service: SyncService
): Promise<void> {
    const metaPath = path.join(knowledgeRoot, '.jarvis-meta.json');
    const meta = await readJarvisMeta(metaPath);
    if (meta.taskSyncMigrationNeeded === false) {
        return;
    }

    const taskStoragePath = path.join(knowledgeRoot, '.chatprism', 'tasks.json');
    try {
        const raw = await fs.readFile(taskStoragePath, 'utf8');
        const parsed = JSON.parse(raw) as { tasks?: unknown[] };
        const tasks = Array.isArray(parsed.tasks)
            ? parsed.tasks.map((task) => normalizeTaskRecord(task))
            : [];
        if (tasks.length > 0) {
            await service.pushTasks(syncKey, tasks);
        }
    } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.warn('[task-sync-migration] Failed to import tasks.json:', error);
            return;
        }
    }

    try {
        await writeJarvisMeta(metaPath, {
            ...meta,
            taskSyncMigrationNeeded: false
        });
    } catch (error) {
        console.warn('[task-sync-migration] Failed to write .jarvis-meta.json:', error);
    }
}

function createTaskSyncMigrationEnsurer(
    knowledgeRoot: string,
    service: SyncService
): (syncKey: string) => Promise<void> {
    let completed = false;
    let inFlight: Promise<void> | null = null;
    const metaPath = path.join(knowledgeRoot, '.jarvis-meta.json');

    return async (syncKey: string) => {
        if (completed) {
            return;
        }

        if (inFlight) {
            await inFlight;
            return;
        }

        inFlight = (async () => {
            await runTaskSyncMigration(knowledgeRoot, syncKey, service);
            const meta = await readJarvisMeta(metaPath);
            completed = meta.taskSyncMigrationNeeded === false;
        })().finally(() => {
            inFlight = null;
        });

        await inFlight;
    };
}

function createTaskCalendarSyncService(): ITaskCalendarSyncService | null {
    const clientId = normalizeEnvValue(process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID);
    const clientSecret = normalizeEnvValue(process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET);
    const refreshToken = normalizeEnvValue(process.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN);
    if (!clientId || !clientSecret || !refreshToken) {
        return null;
    }

    return new GoogleCalendarSyncService({
        env: process.env,
        fetchImpl: fetch
    });
}

function normalizeEnvValue(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed || trimmed === 'undefined') {
        return undefined;
    }
    return trimmed;
}

export function createApp(options: CreateAppOptions = {}) {
    const config = options.config ?? resolveServerConfig();
    const database = options.database ?? createDatabase(config);
    const repository = new SyncRepository(database);
    const contextProvider = options.contextProvider ?? createContextProvider(config, repository);
    const taskCalendarSyncService = createTaskCalendarSyncService();
    const service = new SyncService(repository, taskCalendarSyncService);
    const taskService = options.taskService ?? resolveTaskService({
        config,
        provider: contextProvider,
        repository,
        syncService: service
    });
    const bilibiliTranscriptService = options.bilibiliTranscriptService ?? new BilibiliTranscriptService();
    const contextService = new HttpContextService(contextProvider, taskService);
    const ensureTaskSyncMigrated = config.contextBackend !== 'database' && config.knowledgeRoot
        ? createTaskSyncMigrationEnsurer(config.knowledgeRoot, service)
        : undefined;
    const codexAuthService = new CodexAuthService({
        command: config.codexCommand,
        cwd: config.codexWorkingDirectory
    });
    const codexCliService = new CodexCliService({
        command: config.codexCommand,
        cwd: config.codexWorkingDirectory
    });
    const app = new Hono();

    app.use('*', async (c, next) => {
        const startedAt = Date.now();
        const syncKey = c.req.header('x-sync-key') ?? '-';
        const origin = c.req.header('origin') ?? '-';

        await next();

        const elapsedMs = Date.now() - startedAt;
        const requestError = (c as { get(key: string): unknown }).get('requestError');
        const errorSummary = requestError && typeof requestError === 'object' && 'message' in requestError
            ? ` error=${JSON.stringify(String((requestError as { message: unknown }).message))}`
            : '';
        console.log(
            [
                '[sync-server]',
                c.req.method,
                c.req.path,
                `status=${c.res.status}`,
                `elapsed=${elapsedMs}ms`,
                `syncKey=${syncKey}`,
                `origin=${origin}`
            ].join(' ') + errorSummary
        );
    });

    const rendererRoot = config.rendererDistPath
        ? (path.relative(process.cwd(), config.rendererDistPath) || '.')
        : null;

    // Serve built renderer static assets (index.html, /assets/*). Falls through
    // to API routes on a miss, so API paths are never shadowed by static files.
    if (rendererRoot) {
        app.use('*', serveStatic({ root: rendererRoot }));
    }

    app.route('/health', createHealthRouter());
    app.route('/api/codex', createCodexRouter({
        authService: codexAuthService,
        cliService: codexCliService,
        config
    }));
    app.route('/api/context', createContextRouter({ service: contextService, config }));
    app.route('/api/import', createImportRouter({
        bilibiliTranscriptService,
        config
    }));
    app.route('/api/provider-configs', createProviderConfigRouter());
    app.route('/api/sync', createSyncRouter({
        service,
        config,
        ensureTaskSyncMigrated
    }));

    // SPA fallback: any non-API, non-asset GET serves index.html so client-side
    // routing works. Registered AFTER API routes so it never intercepts them.
    if (rendererRoot) {
        app.get('*', serveStatic({ root: rendererRoot, path: 'index.html' }));
    }

    if (config.contextBackend !== 'database' && config.knowledgeRoot) {
        setImmediate(() => {
            (async () => {
                await runDocumentIdMigration(contextProvider, repository, config.knowledgeRoot!);
                if (config.syncKey) {
                    await ensureTaskSyncMigrated?.(config.syncKey);
                } else {
                    console.info('[task-sync-migration] deferring legacy task migration until the first task sync request because CHATPRISM_SYNC_KEY is not configured.');
                }
            })().catch((err) => {
                console.warn('[startup-migration] Unhandled error:', err);
            });
        });
    }

    return app;
}

function resolveTaskService(options: {
    config: ServerConfig;
    provider: ContextProvider;
    repository: SyncRepository;
    syncService: SyncService;
}): TaskService {
    const syncKey = options.config.syncKey?.trim() || DEFAULT_SYNC_KEY;
    if (options.config.contextBackend !== 'database') {
        return new ServerTaskService({
            repository: options.repository,
            syncService: options.syncService,
            syncKey,
            resolveDocumentIdForTaskPath: async (documentPath) => {
                try {
                    return await options.provider.getDocumentId(documentPath);
                } catch {
                    return null;
                }
            }
        });
    }

    const provider = options.provider;
    if ('getTaskService' in provider && typeof provider.getTaskService === 'function') {
        return provider.getTaskService();
    }

    throw new Error('Task service is not available for the configured context provider.');
}
