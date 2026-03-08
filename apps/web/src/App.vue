<template>
  <div class="app-shell">
    <AppTopBar :is-compare-mode="isCompareMode" :compare-stage="compareStore.stage" @toggle-mode="toggleMode" />
    <main class="view-host">
      <ConversationWorkspaceView
        :is-compare-mode="isCompareMode"
        @request-normal-mode="navigateTo('/')"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { AppTopBar, ConversationWorkspaceView, useChatStore, useCompareStore } from '@packages/ui';
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
  void (async () => {
    try {
      const providerCatalog = providerRuntime.getProviderCatalog();
      await compareStore.setRuntime(providerRuntime);

      if (providerCatalog.length === 0) {
        chatStore.setProviderCatalog([]);
        return;
      }

      chatStore.setModelProviderResolver((providerId: string) => providerRuntime.getProvider(providerId));
      chatStore.setProviderModelsResolver((providerId: string) => providerRuntime.getProviderModels(providerId));
      chatStore.setProviders(
        providerRuntime.getProvider(providerCatalog[0].id),
        new IndexedDBStorageProvider()
      );
      await chatStore.initializeProviderCatalog(providerCatalog);
      await chatStore.init();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      chatStore.currentError = message;
      compareStore.analysisError = message;
      console.error('Failed to initialize provider catalogs', error);
    }
  })();
});
</script>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  width: 100%;
  height: 100%;
  min-height: 100%;
  margin: 0;
  overflow: hidden;
}

.app-shell {
  width: 100%;
  height: 100dvh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.view-host {
  display: flex;
  flex: 1;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
</style>
