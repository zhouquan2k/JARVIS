<template>
  <ChatApp />
</template>

<script setup lang="ts">
import { ChatApp, useChatStore } from '@packages/ui';
import { BackgroundProxyProvider } from './utils/BackgroundProxyProvider';
import { IndexedDBStorageProvider } from '@packages/core/src/providers/IndexedDBStorageProvider';
import { APP_CONFIG } from '@packages/core/config';
import { onMounted } from 'vue';

const chatStore = useChatStore();
const proxyProvider = new BackgroundProxyProvider('');

onMounted(() => {
  // Inject the specific providers for the Extension environment
  chatStore.setProviders(
    proxyProvider,
    new IndexedDBStorageProvider()
  );

  chatStore.setAvailableProviders(
    APP_CONFIG.providers.filter((provider) => provider.supportedRuntimeModes.includes('extension'))
  );
  void chatStore.init();
});
</script>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
</style>
