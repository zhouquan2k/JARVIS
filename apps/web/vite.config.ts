import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@packages/core': resolve(__dirname, '../../packages/core'),
      '@packages/ui': resolve(__dirname, '../../packages/ui')
    }
  }
});
