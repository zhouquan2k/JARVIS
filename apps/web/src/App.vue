<template>
  <ChatApp />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { ChatApp, useChatStore } from '@packages/ui';
import { IndexedDBStorageProvider } from '@packages/core/src/providers/IndexedDBStorageProvider';
import { providerRuntime } from './providerRuntime';

const chatStore = useChatStore();

onMounted(() => {
  const availableProviders = providerRuntime.getAvailableProviders();
  if (availableProviders.length === 0) {
    return;
  }

  chatStore.setAvailableProviders(availableProviders);
  chatStore.setModelProviderResolver((providerId: string) => providerRuntime.getProvider(providerId));
  chatStore.setProviders(providerRuntime.getProvider(availableProviders[0].id), new IndexedDBStorageProvider());
});
</script>
