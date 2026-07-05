import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false,
      includeAssets: [
        'manifest.webmanifest',
        'apple-touch-icon.png',
        'jarvis-192.png',
        'jarvis-512.png',
        'jarvis.png'
      ],
      devOptions: {
        enabled: true,
        type: 'module'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => {
              return request.method === 'GET'
                && url.pathname === '/api/context/read-document';
            },
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'jarvis-web2-document-reads',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    // Bind to 0.0.0.0 so phones/other PCs on the LAN can reach the dev server.
    host: true,
    // web2 dev requests relative /api and /health; proxy them to the API server
    // so the same relative URLs work identically in dev and in production hosting.
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/health': 'http://127.0.0.1:8787'
    }
  },
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
