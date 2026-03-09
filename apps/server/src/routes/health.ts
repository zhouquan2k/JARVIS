import { Hono } from 'hono';

export function createHealthRouter() {
    const app = new Hono();

    app.get('/', (c) => c.json({ status: 'ok' }));

    return app;
}
