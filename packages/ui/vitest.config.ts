import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig(async () => {
    const vue = (await import('@vitejs/plugin-vue')).default;

    return {
        plugins: [vue()],
        test: {
            include: ['src/**/*.test.ts']
        },
        resolve: {
            alias: {
                '@packages/core': resolve(__dirname, '../core'),
                '@packages/ui': resolve(__dirname),
                '@plugins/ai-agent/api': resolve(__dirname, '../../plugins/ai-agent/api.ts'),
                '@plugins/ai-agent': resolve(__dirname, '../../plugins/ai-agent'),
                '@plugins/task-mgr/api': resolve(__dirname, '../../plugins/task-mgr/api.ts'),
                '@plugins/task-mgr': resolve(__dirname, '../../plugins/task-mgr'),
                'lucide-vue-next': resolve(__dirname, './test-support/lucide-vue-next.ts')
            }
        }
    };
});
