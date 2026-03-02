<template>
  <ChatApp />
</template>

<script setup lang="ts">
import { ChatApp, useChatStore } from '@packages/ui';
import { BackgroundProxyProvider } from './utils/BackgroundProxyProvider';
import { IndexedDBStorageProvider } from '@packages/core/src/providers/IndexedDBStorageProvider';
import { onMounted, watch } from 'vue';

const chatStore = useChatStore();
const proxyProvider = new BackgroundProxyProvider('');

onMounted(() => {
  // Inject the specific providers for the Extension environment
  chatStore.setProviders(
    proxyProvider,
    new IndexedDBStorageProvider()
  );
});

watch(() => chatStore.currentProviderId, (newId) => {
  if (newId) {
    proxyProvider.id = newId;
  }
});
</script>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
</style>
