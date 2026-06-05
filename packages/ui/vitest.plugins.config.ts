import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig(async () => {
    const vue = (await import('@vitejs/plugin-vue')).default;

    return {
        plugins: [vue()],
        test: {
            include: ['../../plugins/*/src/**/*.test.ts']
        },
        resolve: {
            alias: {
                '@packages/core': resolve(__dirname, '../core'),
                '@packages/ui': resolve(__dirname),
                '@plugins/ai-agent': resolve(__dirname, '../../plugins/ai-agent'),
                '@plugins/task-mgr': resolve(__dirname, '../../plugins/task-mgr'),
                'lucide-vue-next': resolve(__dirname, './test-support/lucide-vue-next.ts'),
                'vue': resolve(__dirname, './node_modules/vue'),
                'pinia': resolve(__dirname, './node_modules/pinia'),
                '@vue/test-utils': resolve(__dirname, './node_modules/@vue/test-utils/dist/vue-test-utils.esm-bundler.mjs')
            }
        }
    };
});
