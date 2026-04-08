import { defineConfig } from 'wxt';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
    manifest: {
        name: 'JARVIS.ext',
        icons: {
            '16': 'jarvis.png',
            '32': 'jarvis.png',
            '48': 'jarvis.png',
            '128': 'jarvis.png'
        },
        action: {
            default_icon: 'jarvis.png'
        },
        host_permissions: ['*://chatgpt.com/*', 'https://gemini.google.com/*'],
        permissions: ['storage', 'cookies', 'tabs', 'scripting']
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
