import { Hono } from 'hono';
import { createDatabase, type SyncDatabase } from './db.js';
import { resolveServerConfig, type ServerConfig } from './config.js';
import { createHealthRouter } from './routes/health.js';
import { createProviderConfigRouter } from './routes/providerConfigs.js';
import { createSyncRouter } from './routes/sync.js';
import { SyncRepository } from './repositories/syncRepository.js';
import { SyncService } from './services/syncService.js';

export interface CreateAppOptions {
    config?: ServerConfig;
    database?: SyncDatabase;
}

export function createApp(options: CreateAppOptions = {}) {
    const config = options.config ?? resolveServerConfig();
    const database = options.database ?? createDatabase(config);
    const repository = new SyncRepository(database);
    const service = new SyncService(repository);
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
    app.route('/api/provider-configs', createProviderConfigRouter());
    app.route('/api/sync', createSyncRouter({ service, config }));

    return app;
}
