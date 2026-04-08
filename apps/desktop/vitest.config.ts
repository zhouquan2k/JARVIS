import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
    plugins: [vue()],
    test: {
        include: ['src/**/*.test.ts', 'main/**/*.test.ts'],
        environmentMatchGlobs: [
            ['src/**/*.test.ts', 'happy-dom'],
            ['main/**/*.test.ts', 'node']
        ]
    },
    resolve: {
        alias: {
            '@packages/core': resolve(__dirname, '../../packages/core'),
            '@packages/node': resolve(__dirname, '../../packages/node'),
            '@packages/ui': resolve(__dirname, '../../packages/ui'),
            '@vue/test-utils': resolve(__dirname, 'node_modules/@vue/test-utils/dist/vue-test-utils.esm-bundler.mjs')
        }
    }
});
