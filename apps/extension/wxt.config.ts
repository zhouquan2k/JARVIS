import { defineConfig } from 'wxt';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
    manifest: {
        name: 'ChatPrism',
        action: {},
        host_permissions: ['*://chatgpt.com/*'],
        permissions: ['storage', 'cookies', 'tabs']
    },
    srcDir: 'src',
    outDir: 'dist',
    entrypointsDir: '../entrypoints',
    vite: () => ({
        plugins: [vue()],
        resolve: {
            alias: {
                '@packages/core': resolve(__dirname, '../../packages/core'),
                '@packages/ui': resolve(__dirname, '../../packages/ui'),
                'vue': resolve(__dirname, './node_modules/vue'),
                'pinia': resolve(__dirname, './node_modules/pinia')
            }
        }
    })
});
