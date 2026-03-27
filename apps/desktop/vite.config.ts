import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
    base: './',
    plugins: [vue()],
    envPrefix: ['VITE_', 'CHATPRISM_'],
    build: {
        outDir: 'dist/renderer',
        emptyOutDir: true
    },
    resolve: {
        alias: {
            '@packages/core': resolve(__dirname, '../../packages/core'),
            '@packages/ui': resolve(__dirname, '../../packages/ui')
        }
    }
});
