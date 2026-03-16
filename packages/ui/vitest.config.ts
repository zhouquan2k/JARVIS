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
            '@packages/core': resolve(__dirname, '../core'),
            '@packages/ui': resolve(__dirname),
            '@vue/test-utils': resolve(
                __dirname,
                '../../apps/web/node_modules/@vue/test-utils/dist/vue-test-utils.esm-bundler.mjs'
            )
        }
    }
});
