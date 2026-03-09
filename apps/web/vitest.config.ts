import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
    plugins: [vue()],
    test: {
        include: ['src/**/*.test.ts']
    },
    resolve: {
        alias: {
            '@packages/core': resolve(__dirname, '../../packages/core'),
            '@packages/ui': resolve(__dirname, '../../packages/ui')
        }
    }
});
