<template>
  <div class="app-shell">
    <AppTopBar :is-compare-mode="isCompareMode" :compare-stage="compareStore.stage" @toggle-mode="toggleMode" />
    <main class="view-host">
      <component :is="currentRoute.component" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { AppTopBar, useChatStore, useCompareStore } from '@packages/ui';
import { IndexedDBStorageProvider } from '@packages/core/src';
import { currentRoute, navigateTo } from './router';
import { providerRuntime } from './providerRuntime';

const chatStore = useChatStore();
const compareStore = useCompareStore();
const isCompareMode = computed(() => currentRoute.value.path === '/compare');

function toggleMode() {
  navigateTo(isCompareMode.value ? '/' : '/compare');
}

onMounted(() => {
  const availableProviders = providerRuntime.getAvailableProviders();
  compareStore.setRuntime(providerRuntime);

  if (availableProviders.length === 0) {
    chatStore.setAvailableProviders([]);
    return;
  }

  chatStore.setModelProviderResolver((providerId: string) => providerRuntime.getProvider(providerId));
  chatStore.setProviders(
    providerRuntime.getProvider(availableProviders[0].id),
    new IndexedDBStorageProvider()
  );
  chatStore.setAvailableProviders(availableProviders);
  void chatStore.init();
});
</script>

<style scoped>
.app-shell {
  width: 100%;
  height: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.view-host {
  flex: 1;
  min-height: 0;
}
</style>
