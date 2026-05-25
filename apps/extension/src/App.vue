<template>
  <WorkspaceHostApp
    :current-route-path="currentRoute.path"
    :navigate-to="navigateTo"
    :context-provider="contextProvider"
    :show-history-source-switch="true"
    :auth-status-override="codexAuthStatusOverride"
    :auth-unavailable-message="codexAuthMessage"
    :auth-recovery-action-label="codexAuthRecoveryLabel"
    :auth-recovery-action-disabled="isCodexLoginPending"
    @request-auth-recovery="requestCodexLogin"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRaw, watch, watchEffect } from 'vue';
import {
  installGlobalUnhandledErrorFallback,
  openConversationImportDialog,
  useChatStore,
  useCompareStore,
  WorkspaceHostApp
} from '@packages/ui';
import { resolveCodexBaseUrl, type SyncStorageProvider } from '@packages/core/src';
import { currentRoute, navigateTo } from './router';
import { createExtensionContextProvider } from './context/createExtensionContextProvider';
import { agentRuntime, createExtensionHistoryProviders, modelProviderRuntime } from './modelProviderRuntime';
import { loadLatestCompareConversation, saveCompareConversation } from './persistence/saveCompareConversation';
import { createExtensionSyncStorageProvider } from './sync';

const chatStore = useChatStore();
const compareStore = useCompareStore();
const historyProviders = createExtensionHistoryProviders();
const contextProvider = createExtensionContextProvider({
  env: import.meta.env as Record<string, string | undefined>
});
const isHydratingCompare = ref(false);
const lastPersistedCompareKey = ref('');
let storageProvider: SyncStorageProvider | null = null;
let syncIntervalId: number | null = null;
let onlineHandler: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;
let removeUnhandledErrorFallback: (() => void) | null = null;
const codexAuthStatus = ref<boolean | null>(null);
const isCodexLoginPending = ref(false);
const codexBaseUrl = resolveCodexBaseUrl({
  env: import.meta.env as Record<string, string | undefined>
});
const codexAuthStatusOverride = computed(() => {
  return chatStore.currentProviderId === 'chatgpt-codex' ? codexAuthStatus.value : null;
});
const codexAuthMessage = computed(() => {
  if (chatStore.currentProviderId !== 'chatgpt-codex') {
    return '';
  }

  if (isCodexLoginPending.value) {
    return '正在打开 Codex 登录流程...';
  }

  return codexAuthStatus.value === false
    ? 'Codex provider 当前未认证，请先完成登录后再继续。'
    : '';
});
const codexAuthRecoveryLabel = computed(() => {
  if (chatStore.currentProviderId !== 'chatgpt-codex' || codexAuthStatus.value !== false) {
    return '';
  }

  return isCodexLoginPending.value ? '打开中...' : '登录 Codex';
});

async function refreshCodexAuthStatus(): Promise<boolean | null> {
  if (chatStore.currentProviderId !== 'chatgpt-codex') {
    codexAuthStatus.value = null;
    return null;
  }

  try {
    const isAuthenticated = await chatStore.checkAuth();
    codexAuthStatus.value = isAuthenticated;
    return isAuthenticated;
  } catch (error) {
    codexAuthStatus.value = false;
    console.warn('Extension Codex auth refresh failed.', error);
    return false;
  }
}

async function requestCodexLogin(): Promise<void> {
  if (chatStore.currentProviderId !== 'chatgpt-codex' || isCodexLoginPending.value) {
    return;
  }

  isCodexLoginPending.value = true;
  try {
    const response = await fetch(`${codexBaseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: '{}'
    });
    const payload = await response.json() as { verificationUri?: string; message?: string };
    if (!response.ok) {
      throw new Error(payload.message || 'Failed to start Codex login.');
    }

    if (payload.verificationUri) {
      window.open(payload.verificationUri, '_blank', 'noopener');
    }

    for (let attempt = 0; attempt < 15; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      if (await refreshCodexAuthStatus()) {
        await chatStore.reloadProviderModels('chatgpt-codex');
        break;
      }
    }
  } catch (error) {
    codexAuthStatus.value = false;
    console.error('Failed to start Codex login.', error);
  } finally {
    isCodexLoginPending.value = false;
  }
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
  removeUnhandledErrorFallback = installGlobalUnhandledErrorFallback({
    reportError: (message) => {
      chatStore.reportUnhandledBackendError(message);
    }
  });

  void (async () => {
    try {
      const providerCatalog = modelProviderRuntime.getProviderCatalog();
      await compareStore.setRuntime(modelProviderRuntime);

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

      chatStore.setModelProviderResolver((providerId: string) => modelProviderRuntime.getProvider(providerId));
      chatStore.setProviderModelsResolver((providerId: string) => modelProviderRuntime.getProviderModels(providerId));
      chatStore.setProviders(
        modelProviderRuntime.getProvider(providerCatalog[0].id),
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
      await refreshCodexAuthStatus();

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

watch(() => chatStore.currentProviderId, () => {
  void refreshCodexAuthStatus();
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
  removeUnhandledErrorFallback?.();
  removeUnhandledErrorFallback = null;
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
