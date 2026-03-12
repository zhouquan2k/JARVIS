import { Hono, type Context } from 'hono';
import geminiHistoryConfig from '../provider-configs/gemini-history.json';

const PROVIDER_CONFIG_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=600';
const PROVIDER_CONFIG_ALLOW_METHODS = 'GET, OPTIONS';

const PROVIDER_CONFIGS = {
    'gemini-history': geminiHistoryConfig
} as const;

function applyCorsHeaders(c: Context) {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', PROVIDER_CONFIG_ALLOW_METHODS);
}

export function createProviderConfigRouter() {
    const app = new Hono();

    app.options('/:providerId', (c) => {
        applyCorsHeaders(c);
        return c.body(null, 204);
    });

    app.get('/:providerId', (c) => {
        const providerId = c.req.param('providerId');
        const config = PROVIDER_CONFIGS[providerId as keyof typeof PROVIDER_CONFIGS];

        applyCorsHeaders(c);

        if (!config) {
            return c.json({ error: `Provider config '${providerId}' not found.` }, 404);
        }

        c.header('Cache-Control', PROVIDER_CONFIG_CACHE_CONTROL);
        c.header('ETag', `W/"${providerId}:${config.version}"`);
        c.header('X-Provider-Config-Version', config.version);

        return c.json(config);
    });

    return app;
}
