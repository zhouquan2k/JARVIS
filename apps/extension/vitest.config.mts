import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [vue()],
    test: {
        include: ['src/**/*.test.ts']
    },
    resolve: {
        alias: {
            '@packages/core': resolve(__dirname, '../../packages/core'),
            '@packages/ui': resolve(__dirname, '../../packages/ui'),
            'vue': resolve(__dirname, './node_modules/vue'),
            'pinia': resolve(__dirname, './node_modules/pinia')
        }
    }
});
