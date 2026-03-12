<template>
  <div class="app-shell">
    <AppTopBar :is-compare-mode="isCompareMode" :compare-stage="compareStore.stage" />
    <main class="view-host">
      <ConversationWorkspaceView
        :is-compare-mode="isCompareMode"
        :show-history-source-switch="false"
        @request-normal-mode="navigateTo('/')"
        @request-compare-mode="openCompareMode"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import {
  AppTopBar,
  ConversationWorkspaceView,
  openConversationImportDialog,
  useChatStore,
  useCompareStore
} from '@packages/ui';
import { currentRoute, navigateTo } from './router';
import { createWebHistoryProviders, providerRuntime } from './providerRuntime';
import { createWebSyncStorageProvider } from './sync';

const chatStore = useChatStore();
const compareStore = useCompareStore();
const historyProviders = createWebHistoryProviders();
const isCompareMode = computed(() => currentRoute.value.path === '/compare');

function openCompareMode() {
  compareStore.startNewCompare();
  navigateTo('/compare');
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

      const syncStorageProvider = createWebSyncStorageProvider({
        storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
        env: import.meta.env as Record<string, string | undefined>,
        isDevelopment: import.meta.env.DEV
      });

      chatStore.setModelProviderResolver((providerId: string) => providerRuntime.getProvider(providerId));
      chatStore.setProviderModelsResolver((providerId: string) => providerRuntime.getProviderModels(providerId));
      chatStore.setProviders(
        providerRuntime.getProvider(providerCatalog[0].id),
        syncStorageProvider
      );
      chatStore.setHistoryProviders(historyProviders);
      chatStore.setExternalFileImportHandler(async () => {
        return openConversationImportDialog();
      });
      await syncStorageProvider.hydrate().catch((error) => {
        console.warn('Web sync hydration failed, continuing with local data only.', error);
      });
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
