import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node'
    },
    resolve: {
        alias: {
            '@packages/core': resolve(__dirname, '../core'),
            '@plugins/ai-agent': resolve(__dirname, '../../plugins/ai-agent'),
            '@plugins/task-mgr': resolve(__dirname, '../../plugins/task-mgr')
        }
    }
});
