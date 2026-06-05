import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { FileSystemContextProvider } from '../../../packages/node/src/context/FileSystemContextProvider.ts';
import { GoogleCalendarSyncService } from '../../../packages/node/src/context/GoogleCalendarSyncService.ts';
import { createDatabase, type SyncDatabase } from './db.js';
import { resolveServerConfig, type ServerConfig } from './config.js';
import { createCodexRouter } from './routes/codex.js';
import { createContextRouter } from './routes/context.js';
import { createHealthRouter } from './routes/health.js';
import { createProviderConfigRouter } from './routes/providerConfigs.js';
import { createSyncRouter } from './routes/sync.js';
import { DatabaseContextProvider } from './providers/databaseContextProvider.js';
import { SyncRepository } from './repositories/syncRepository.js';
import { CodexAuthService } from './services/codexAuthService.js';
import { CodexCliService } from './services/codexCliService.js';
import { HttpContextService } from './services/httpContextService.js';
import { SyncService } from './services/syncService.js';
import type { ContextProvider } from './types/context.js';
import type { TaskService } from '@plugins/task-mgr/api';

export interface CreateAppOptions {
    config?: ServerConfig;
    database?: SyncDatabase;
    contextProvider?: ContextProvider;
    taskService?: TaskService;
}

function createContextProvider(config: ServerConfig, repository: SyncRepository): ContextProvider {
    if (config.contextBackend === 'database') {
        return new DatabaseContextProvider();
    }

    const clientId = normalizeEnvValue(process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID);
    const clientSecret = normalizeEnvValue(process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET);
    const refreshToken = normalizeEnvValue(process.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN);
    const calendarId = normalizeEnvValue(process.env.CHATPRISM_GOOGLE_CALENDAR_ID) || 'primary';
    const hasCalendarSyncConfig = Boolean(
        clientId
        && clientSecret
        && refreshToken
    );
    console.info('[sync-server] creating local-file context provider', {
        knowledgeRoot: config.knowledgeRoot,
        calendarSyncEnabled: hasCalendarSyncConfig,
        calendarId
    });

    return new FileSystemContextProvider({
        rootPath: config.knowledgeRoot,
        conversationQueryProvider: repository,
        taskCalendarSyncService: hasCalendarSyncConfig
            ? new GoogleCalendarSyncService({
                env: process.env,
                fetchImpl: fetch
            })
            : null
    });
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
        await fs.mkdir(path.dirname(metaPath), { recursive: true });
        await fs.writeFile(metaPath, JSON.stringify({ migrateNeeded: false }, null, 2) + '\n', 'utf8');
        console.info(`[document-id-migration] Complete. Migrated ${migrated}/${rows.length} conversations.`);
    } catch (err) {
        console.warn('[document-id-migration] Failed to write .jarvis-meta.json:', err);
    }
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
    const taskService = options.taskService ?? resolveTaskService(contextProvider);
    const service = new SyncService(repository);
    const contextService = new HttpContextService(contextProvider, taskService);
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

    app.route('/health', createHealthRouter());
    app.route('/api/codex', createCodexRouter({
        authService: codexAuthService,
        cliService: codexCliService,
        config
    }));
    app.route('/api/context', createContextRouter({ service: contextService, config }));
    app.route('/api/provider-configs', createProviderConfigRouter());
    app.route('/api/sync', createSyncRouter({ service, config }));

    if (config.contextBackend !== 'database' && config.knowledgeRoot) {
        setImmediate(() => {
            runDocumentIdMigration(contextProvider, repository, config.knowledgeRoot!).catch((err) => {
                console.warn('[document-id-migration] Unhandled error:', err);
            });
        });
    }

    return app;
}

function resolveTaskService(provider: ContextProvider): TaskService {
    if ('getTaskService' in provider && typeof provider.getTaskService === 'function') {
        return provider.getTaskService();
    }

    throw new Error('Task service is not available for the configured context provider.');
}
