<template>
  <WorkspaceHostApp
    :current-route-path="currentRoute.path"
    :navigate-to="navigateTo"
    :context-provider="contextProvider"
    :auth-status-override="codexAuthStatusOverride"
    :auth-unavailable-message="codexAuthMessage"
    :auth-recovery-action-label="codexAuthRecoveryLabel"
    :auth-recovery-action-disabled="isCodexLoginPending"
    @request-auth-recovery="requestCodexLogin"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  installGlobalUnhandledErrorFallback,
  openConversationImportDialog,
  useChatStore,
  useCompareStore,
  WorkspaceHostApp
} from '@packages/ui';
import { resolveCodexBaseUrl } from '@packages/core/src';
import { currentRoute, navigateTo } from './router';
import { createWebContextProvider } from './context/createWebContextProvider';
import { agentRuntime, createWebHistoryProviders, modelProviderRuntime } from './modelProviderRuntime';
import { createWebSyncStorageProvider, resetWebSyncCache } from './sync';

const chatStore = useChatStore();
const compareStore = useCompareStore();
const historyProviders = createWebHistoryProviders();
const contextProvider = createWebContextProvider({
  env: import.meta.env as Record<string, string | undefined>
});
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
    console.warn('Web Codex auth refresh failed.', error);
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

onMounted(() => {
  removeUnhandledErrorFallback = installGlobalUnhandledErrorFallback({
    reportError: (message) => {
      chatStore.reportUnhandledBackendError(message);
    }
  });

  void (async () => {
    try {
      if (import.meta.env.DEV) {
        (window as Window & {
          __CHATPRISM_RESET_WEB_SYNC_CACHE__?: () => Promise<void>;
        }).__CHATPRISM_RESET_WEB_SYNC_CACHE__ = () => resetWebSyncCache({
          storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
          env: import.meta.env as Record<string, string | undefined>,
          isDevelopment: import.meta.env.DEV
        });
      }

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
      await refreshCodexAuthStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      chatStore.currentError = message;
      compareStore.analysisError = message;
      console.error('Failed to initialize provider catalogs', error);
    }
  })();
});

watch(() => chatStore.currentProviderId, () => {
  void refreshCodexAuthStatus();
});

onBeforeUnmount(() => {
  removeUnhandledErrorFallback?.();
  removeUnhandledErrorFallback = null;
});
</script>
