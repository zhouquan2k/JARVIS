import { Hono } from 'hono';
import { FileSystemContextProvider } from '../../../packages/node/src/context/FileSystemContextProvider.ts';
import { createDatabase, type SyncDatabase } from './db.js';
import { resolveServerConfig, type ServerConfig } from './config.js';
import { createContextRouter } from './routes/context.js';
import { createHealthRouter } from './routes/health.js';
import { createProviderConfigRouter } from './routes/providerConfigs.js';
import { createSyncRouter } from './routes/sync.js';
import { DatabaseContextProvider } from './providers/databaseContextProvider.js';
import { SyncRepository } from './repositories/syncRepository.js';
import { HttpContextService } from './services/httpContextService.js';
import { SyncService } from './services/syncService.js';
import type { ContextProvider } from './types/context.js';

export interface CreateAppOptions {
    config?: ServerConfig;
    database?: SyncDatabase;
    contextProvider?: ContextProvider;
}

function createContextProvider(config: ServerConfig): ContextProvider {
    if (config.contextBackend === 'database') {
        return new DatabaseContextProvider();
    }

    return new FileSystemContextProvider({
        rootPath: config.knowledgeRoot
    });
}

export function createApp(options: CreateAppOptions = {}) {
    const config = options.config ?? resolveServerConfig();
    const database = options.database ?? createDatabase(config);
    const contextProvider = options.contextProvider ?? createContextProvider(config);
    const repository = new SyncRepository(database);
    const service = new SyncService(repository);
    const contextService = new HttpContextService(contextProvider);
    const app = new Hono();

    app.use('*', async (c, next) => {
        const startedAt = Date.now();
        const syncKey = c.req.header('x-sync-key') ?? '-';
        const origin = c.req.header('origin') ?? '-';

        await next();

        const elapsedMs = Date.now() - startedAt;
        console.log(
            [
                '[sync-server]',
                c.req.method,
                c.req.path,
                `status=${c.res.status}`,
                `elapsed=${elapsedMs}ms`,
                `syncKey=${syncKey}`,
                `origin=${origin}`
            ].join(' ')
        );
    });

    app.route('/health', createHealthRouter());
    app.route('/api/context', createContextRouter({ service: contextService, config }));
    app.route('/api/provider-configs', createProviderConfigRouter());
    app.route('/api/sync', createSyncRouter({ service, config }));

    return app;
}
