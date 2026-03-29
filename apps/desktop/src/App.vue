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
      <KnowledgeWorkspaceView
        v-if="isKnowledgeMode"
        :context-provider="contextProvider"
      />
      <ConversationWorkspaceView
        v-else
        :is-compare-mode="isCompareMode"
        :show-history-source-switch="true"
        :auth-status-override="chatgptAuthStatusOverride"
        :auth-unavailable-message="chatgptAuthMessage"
        :auth-recovery-action-label="chatgptAuthRecoveryLabel"
        :auth-recovery-action-disabled="isOpeningChatGPTLogin"
        @request-normal-mode="navigateTo('/chat')"
        @request-compare-mode="openCompareMode"
        @request-auth-recovery="requestChatGPTLogin"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AppTopBar,
  ConversationWorkspaceView,
  KnowledgeWorkspaceView,
  PRIMARY_WORKSPACE_ROUTES,
  openConversationImportDialog,
  type ChatRoutePath,
  useChatStore,
  useCompareStore
} from '@packages/ui';
import { currentRoute, navigateTo } from './router';
import { createDesktopContextProvider } from './context/createDesktopContextProvider';
import { agentRuntime, createDesktopHistoryProviders, providerRuntime } from './providerRuntime';
import { createDesktopSyncStorageProvider } from './sync';

const chatStore = useChatStore();
const compareStore = useCompareStore();
const historyProviders = createDesktopHistoryProviders();
const isCompareMode = computed(() => currentRoute.value.path === '/compare');
const isKnowledgeMode = computed(() => currentRoute.value.path === '/');
const activeWorkspacePath = computed<ChatRoutePath>(() => currentRoute.value.path === '/compare' ? '/chat' : currentRoute.value.path);
const contextProvider = createDesktopContextProvider();
const chatgptAuthStatus = ref<boolean | null>(null);
const isOpeningChatGPTLogin = ref(false);
const chatgptLoginLaunchAcknowledged = ref(false);
let removeLoginWindowClosedListener: (() => void) | null = null;
let removeLoginWindowOpenedListener: (() => void) | null = null;
let authRefreshSequence = 0;
let chatgptLoginLaunchTimer: ReturnType<typeof setTimeout> | null = null;

const chatgptAuthStatusOverride = computed(() => {
  return chatStore.currentProviderId === 'chatgpt-web' ? chatgptAuthStatus.value : null;
});
const chatgptAuthMessage = computed(() => {
  if (isOpeningChatGPTLogin.value) {
    return '正在打开 ChatGPT 登录窗口...';
  }

  if (chatgptLoginLaunchAcknowledged.value) {
    return '已请求打开 ChatGPT 登录窗口；如果未看到窗口，请检查当前桌面、Dock 或切换空间。';
  }

  return chatgptAuthStatusOverride.value === false
    ? '当前桌面宿主的 ChatGPT 登录态不可用，请先登录后再继续。'
    : '';
});
const chatgptAuthRecoveryLabel = computed(() => {
  if (isOpeningChatGPTLogin.value) {
    return '打开中...';
  }

  if (chatgptAuthStatusOverride.value === false && chatgptLoginLaunchAcknowledged.value) {
    return '重新打开 ChatGPT';
  }

  return chatgptAuthStatusOverride.value === false ? '登录 ChatGPT' : '';
});

function openCompareMode() {
  compareStore.startNewCompare();
  navigateTo('/compare');
}

function onNavigateWorkspace(path: ChatRoutePath) {
  navigateTo(path);
}

async function refreshChatGPTAuthStatus(): Promise<boolean | null> {
  if (chatStore.currentProviderId !== 'chatgpt-web') {
    chatgptAuthStatus.value = null;
    return null;
  }

  const currentSequence = ++authRefreshSequence;
  try {
    const isAuthenticated = await chatStore.checkAuth();
    if (currentSequence === authRefreshSequence) {
      chatgptAuthStatus.value = isAuthenticated;
    }
    return isAuthenticated;
  } catch (error) {
    if (currentSequence === authRefreshSequence) {
      chatgptAuthStatus.value = false;
    }
    console.warn('Desktop ChatGPT auth refresh failed.', error);
    return false;
  }
}

async function requestChatGPTLogin(): Promise<void> {
  const bridge = window.chatprismDesktop;
  if (!bridge || isOpeningChatGPTLogin.value || chatStore.currentProviderId !== 'chatgpt-web') {
    return;
  }

  isOpeningChatGPTLogin.value = true;
  chatgptLoginLaunchAcknowledged.value = false;
  if (chatgptLoginLaunchTimer) {
    clearTimeout(chatgptLoginLaunchTimer);
  }
  chatgptLoginLaunchTimer = setTimeout(() => {
    isOpeningChatGPTLogin.value = false;
    chatgptLoginLaunchAcknowledged.value = true;
  }, 1500);
  try {
    await bridge.openProviderLoginWindow('chatgpt-web');
  } catch (error) {
    isOpeningChatGPTLogin.value = false;
    chatgptLoginLaunchAcknowledged.value = true;
    console.error('Failed to open ChatGPT login window.', error);
  }
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
      const storageProvider = createDesktopSyncStorageProvider({
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
        console.warn('Desktop sync hydration failed, continuing with local data only.', error);
      });
      await chatStore.initializeProviderCatalog(providerCatalog);
      await chatStore.init();
      await refreshChatGPTAuthStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      chatStore.currentError = message;
      compareStore.analysisError = message;
      console.error('Failed to initialize desktop provider catalogs', error);
    }
  })();

  removeLoginWindowClosedListener = window.chatprismDesktop?.onProviderLoginWindowClosed((providerId: string) => {
    if (providerId === 'chatgpt-web') {
      isOpeningChatGPTLogin.value = false;
      chatgptLoginLaunchAcknowledged.value = false;
      void (async () => {
        const isAuthenticated = await refreshChatGPTAuthStatus();
        if (isAuthenticated) {
          await chatStore.reloadProviderModels('chatgpt-web');
        }
      })();
    }
  }) || null;
  removeLoginWindowOpenedListener = window.chatprismDesktop?.onProviderLoginWindowOpened((providerId: string) => {
    if (providerId === 'chatgpt-web') {
      isOpeningChatGPTLogin.value = false;
      chatgptLoginLaunchAcknowledged.value = true;
      if (chatgptLoginLaunchTimer) {
        clearTimeout(chatgptLoginLaunchTimer);
        chatgptLoginLaunchTimer = null;
      }
    }
  }) || null;
});

watch(() => chatStore.currentProviderId, () => {
  void refreshChatGPTAuthStatus();
});

onBeforeUnmount(() => {
  if (chatgptLoginLaunchTimer) {
    clearTimeout(chatgptLoginLaunchTimer);
    chatgptLoginLaunchTimer = null;
  }
  removeLoginWindowOpenedListener?.();
  removeLoginWindowOpenedListener = null;
  removeLoginWindowClosedListener?.();
  removeLoginWindowClosedListener = null;
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
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
</style>
