import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@packages/core': resolve(__dirname, '../../packages/core'),
      '@packages/ui': resolve(__dirname, '../../packages/ui'),
      '@plugins/ai-agent/api': resolve(__dirname, '../../plugins/ai-agent/api.ts'),
      '@plugins/ai-agent': resolve(__dirname, '../../plugins/ai-agent'),
      '@plugins/task-mgr/api': resolve(__dirname, '../../plugins/task-mgr/api.ts'),
      '@plugins/task-mgr': resolve(__dirname, '../../plugins/task-mgr'),
      'vue': resolve(__dirname, './node_modules/vue'),
      'pinia': resolve(__dirname, './node_modules/pinia'),
      'lucide-vue-next': resolve(__dirname, '../../packages/ui/node_modules/lucide-vue-next')
    }
  }
});
