import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { resolveServerConfig } from './config.js';

const config = resolveServerConfig();
const app = createApp({ config });

serve(
    {
        fetch: app.fetch,
        port: config.port
    },
    (info) => {
        console.log(`ChatPrism sync server listening on http://localhost:${info.port}`);
        console.log(`ChatPrism sync database path: ${config.dbPath}`);
    }
);
