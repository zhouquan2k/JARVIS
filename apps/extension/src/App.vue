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
import { computed, onMounted, ref, toRaw, watchEffect } from 'vue';
import { AppTopBar, ConversationWorkspaceView, useChatStore, useCompareStore } from '@packages/ui';
import { IndexedDBStorageProvider } from '@packages/core/src';
import { currentRoute, navigateTo } from './router';
import { createExtensionHistoryProvider, providerRuntime } from './providerRuntime';
import { loadLatestCompareConversation, saveCompareConversation } from './persistence/saveCompareConversation';

const chatStore = useChatStore();
const compareStore = useCompareStore();
const storageProvider = new IndexedDBStorageProvider();
const historyProvider = createExtensionHistoryProvider();
const isCompareMode = computed(() => currentRoute.value.path === '/compare');
const isHydratingCompare = ref(false);
const lastPersistedCompareKey = ref('');

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
        storageProvider,
        historyProvider
      );
      chatStore.setHistoryProvider(historyProvider);
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
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
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
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
</style>
