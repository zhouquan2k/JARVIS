<template>
  <div class="app-shell">
    <AppTopBar
      :is-compare-mode="isCompareMode"
      :compare-stage="compareStore.stage"
      :active-workspace-path="activeWorkspacePath"
      :workspace-options="PRIMARY_WORKSPACE_ROUTES"
      @navigate-workspace="onNavigateWorkspace"
    />
    <main class="view-host">
      <DocumentWorkspaceView
        v-if="isKnowledgeMode"
        :context-provider="contextProvider"
      />
      <ConversationWorkspaceView
        v-else
        :is-compare-mode="isCompareMode"
        :show-history-source-switch="true"
        @request-normal-mode="navigateTo('/chat')"
        @request-compare-mode="openCompareMode"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRaw, watchEffect } from 'vue';
import {
  AppTopBar,
  ConversationWorkspaceView,
  DocumentWorkspaceView,
  PRIMARY_WORKSPACE_ROUTES,
  openConversationImportDialog,
  type ChatRoutePath,
  useChatStore,
  useCompareStore
} from '@packages/ui';
import { type SyncStorageProvider } from '@packages/core/src';
import { currentRoute, navigateTo } from './router';
import { createExtensionContextProvider } from './context/createExtensionContextProvider';
import { agentRuntime, createExtensionHistoryProviders, providerRuntime } from './providerRuntime';
import { loadLatestCompareConversation, saveCompareConversation } from './persistence/saveCompareConversation';
import { createExtensionSyncStorageProvider } from './sync';

const chatStore = useChatStore();
const compareStore = useCompareStore();
const historyProviders = createExtensionHistoryProviders();
const isCompareMode = computed(() => currentRoute.value.path === '/compare');
const isKnowledgeMode = computed(() => currentRoute.value.path === '/');
const activeWorkspacePath = computed<ChatRoutePath>(() => currentRoute.value.path === '/compare' ? '/chat' : currentRoute.value.path);
const contextProvider = createExtensionContextProvider({
  env: import.meta.env as Record<string, string | undefined>
});
const isHydratingCompare = ref(false);
const lastPersistedCompareKey = ref('');
let storageProvider: SyncStorageProvider | null = null;
let syncIntervalId: number | null = null;
let onlineHandler: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;

function openCompareMode() {
  compareStore.startNewCompare();
  navigateTo('/compare');
}

function onNavigateWorkspace(path: ChatRoutePath) {
  navigateTo(path);
}

function triggerSync() {
  if (!storageProvider) {
    return;
  }

  void storageProvider.syncNow().catch((error) => {
    console.warn('Extension sync trigger failed.', error);
  });
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

      chatStore.setAgentRuntime(agentRuntime);
      storageProvider = createExtensionSyncStorageProvider({
        storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
        env: import.meta.env as Record<string, string | undefined>,
        isDevelopment: import.meta.env.DEV
      });

      chatStore.setModelProviderResolver((providerId: string) => providerRuntime.getProvider(providerId));
      chatStore.setProviderModelsResolver((providerId: string) => providerRuntime.getProviderModels(providerId));
      chatStore.setProviders(
        providerRuntime.getProvider(providerCatalog[0].id),
        storageProvider
      );
      chatStore.setHistoryProviders(historyProviders);
      chatStore.setExternalFileImportHandler(async () => {
        return openConversationImportDialog();
      });
      await storageProvider.hydrate().catch((error) => {
        console.warn('Extension sync hydration failed, continuing with local data only.', error);
      });
      await chatStore.initializeProviderCatalog(providerCatalog);
      await chatStore.init();

      const latestCompareConversation = await loadLatestCompareConversation(storageProvider);
      if (!latestCompareConversation?.compare) {
        return;
      }

      const compare = latestCompareConversation.compare;
      isHydratingCompare.value = true;
      await compareStore.setModelA(compare.modelAProviderId, compare.modelAModelId);
      await compareStore.setModelB(compare.modelBProviderId, compare.modelBModelId);
      compareStore.prompt = compare.prompt;
      compareStore.outputA = compare.outputA;
      compareStore.outputB = compare.outputB;
      compareStore.analysisResult = compare.analysisResult;
      compareStore.analysisRaw = compare.analysisRaw || '';
      compareStore.analysisError = null;
      compareStore.hasAnalysisStartedStreaming = true;
      compareStore.stage = 'completed';
      compareStore.activeTab = 'analysis';
      isHydratingCompare.value = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      chatStore.currentError = message;
      compareStore.analysisError = message;
      console.error('Failed to initialize extension provider catalogs', error);
    }
  })();
});

onMounted(() => {
  onlineHandler = () => triggerSync();
  visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      triggerSync();
    }
  };
  window.addEventListener('online', onlineHandler);
  document.addEventListener('visibilitychange', visibilityHandler);
  syncIntervalId = window.setInterval(() => {
    triggerSync();
  }, 30_000);
});

onUnmounted(() => {
  if (onlineHandler) {
    window.removeEventListener('online', onlineHandler);
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
  }
  if (syncIntervalId !== null) {
    window.clearInterval(syncIntervalId);
  }
});

watchEffect(() => {
  if (isHydratingCompare.value || compareStore.stage !== 'completed' || !compareStore.analysisResult) {
    return;
  }

  const persistKey = [
    compareStore.prompt,
    compareStore.modelAProviderId,
    compareStore.modelAModelId,
    compareStore.modelBProviderId,
    compareStore.modelBModelId,
    compareStore.outputA,
    compareStore.outputB,
    compareStore.analysisRaw
  ].join('::');

  if (persistKey === lastPersistedCompareKey.value) {
    return;
  }
  lastPersistedCompareKey.value = persistKey;

  const rawAnalysisResult = toRaw(compareStore.analysisResult);
  void saveCompareConversation(storageProvider, {
    prompt: compareStore.prompt,
    modelAProviderId: compareStore.modelAProviderId,
    modelAModelId: compareStore.modelAModelId,
    modelBProviderId: compareStore.modelBProviderId,
    modelBModelId: compareStore.modelBModelId,
    outputA: compareStore.outputA,
    outputB: compareStore.outputB,
    analysisResult: { ...rawAnalysisResult },
    analysisRaw: compareStore.analysisRaw
  }).catch((error) => {
    console.error('Failed to persist compare conversation', error);
  });
});
</script>

<style scoped>
:global(html),
:global(body) {
  margin: 0;
  width: 100%;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
}

:global(#app) {
  width: 100%;
  height: 100%;
  min-height: 100%;
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
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
</style>
