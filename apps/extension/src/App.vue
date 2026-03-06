<template>
  <div class="app-shell">
    <AppTopBar :is-compare-mode="isCompareMode" :compare-stage="compareStore.stage" @toggle-mode="toggleMode" />
    <main class="view-host">
      <component :is="currentRoute.component" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watchEffect } from 'vue';
import { AppTopBar, useChatStore, useCompareStore } from '@packages/ui';
import { IndexedDBStorageProvider } from '@packages/core/src';
import { currentRoute, navigateTo } from './router';
import { providerRuntime } from './providerRuntime';
import { loadLatestCompareConversation, saveCompareConversation } from './persistence/saveCompareConversation';

const chatStore = useChatStore();
const compareStore = useCompareStore();
const storageProvider = new IndexedDBStorageProvider();
const isCompareMode = computed(() => currentRoute.value.path === '/compare');
const isHydratingCompare = ref(false);
const lastPersistedCompareKey = ref('');

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
    storageProvider
  );
  chatStore.setAvailableProviders(availableProviders);
  void chatStore.init();

  void (async () => {
    const latestCompareConversation = await loadLatestCompareConversation(storageProvider);
    if (!latestCompareConversation?.compare) {
      return;
    }

    const compare = latestCompareConversation.compare;
    isHydratingCompare.value = true;
    compareStore.setModelA(compare.modelAProviderId, compare.modelAModelId);
    compareStore.setModelB(compare.modelBProviderId, compare.modelBModelId);
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
:global(body) {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

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
