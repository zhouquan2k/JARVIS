<template>
  <WorkspaceHostApp
    :current-route-path="currentRoute.path"
    :navigate-to="navigateTo"
    :context-provider="contextProvider"
  />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import {
  openConversationImportDialog,
  useChatStore,
  useCompareStore,
  WorkspaceHostApp
} from '@packages/ui';
import { currentRoute, navigateTo } from './router';
import { createWebContextProvider } from './context/createWebContextProvider';
import { agentRuntime, createWebHistoryProviders, modelProviderRuntime } from './modelProviderRuntime';
import { createWebSyncStorageProvider } from './sync';

const chatStore = useChatStore();
const compareStore = useCompareStore();
const historyProviders = createWebHistoryProviders();
const contextProvider = createWebContextProvider({
  env: import.meta.env as Record<string, string | undefined>
});

onMounted(() => {
  void (async () => {
    try {
      const providerCatalog = modelProviderRuntime.getProviderCatalog();
      await compareStore.setRuntime(modelProviderRuntime);

      if (providerCatalog.length === 0) {
        chatStore.setProviderCatalog([]);
        return;
      }

      chatStore.setAgentRuntime(agentRuntime);
      const syncStorageProvider = createWebSyncStorageProvider({
        storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
        env: import.meta.env as Record<string, string | undefined>,
        isDevelopment: import.meta.env.DEV
      });

      chatStore.setModelProviderResolver((providerId: string) => modelProviderRuntime.getProvider(providerId));
      chatStore.setProviderModelsResolver((providerId: string) => modelProviderRuntime.getProviderModels(providerId));
      chatStore.setProviders(
        modelProviderRuntime.getProvider(providerCatalog[0].id),
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
