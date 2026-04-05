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
        :auth-status-override="chatgptAuthStatusOverride"
        :auth-unavailable-message="chatgptAuthMessage"
        :auth-recovery-action-label="chatgptAuthRecoveryLabel"
        :auth-recovery-action-disabled="isLoginActionDisabled('chatgpt-web')"
        :host-recovery-message="hostRecoveryMessage"
        :host-recovery-action-label="hostRecoveryActionLabel"
        :host-recovery-action-disabled="hostRecoveryActionDisabled"
        @request-normal-mode="navigateTo('/chat')"
        @request-compare-mode="openCompareMode"
        @request-auth-recovery="requestChatGPTLogin"
        @request-host-recovery="requestGeminiHistoryLogin"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
import { currentRoute, navigateTo } from './router';
import { createDesktopContextProvider } from './context/createDesktopContextProvider';
import { agentRuntime, createDesktopHistoryProviders, modelProviderRuntime } from './modelProviderRuntime';
import { createDesktopSyncStorageProvider } from './sync';

const chatStore = useChatStore();
const compareStore = useCompareStore();
const historyProviders = createDesktopHistoryProviders();
type LoginProviderId = 'chatgpt-web' | 'gemini-web';
const isCompareMode = computed(() => currentRoute.value.path === '/compare');
const isKnowledgeMode = computed(() => currentRoute.value.path === '/');
const activeWorkspacePath = computed<ChatRoutePath>(() => currentRoute.value.path === '/compare' ? '/chat' : currentRoute.value.path);
const contextProvider = createDesktopContextProvider();
const chatgptAuthStatus = ref<boolean | null>(null);
const openingProviderLoginId = ref<LoginProviderId | null>(null);
const acknowledgedProviderLoginId = ref<LoginProviderId | null>(null);
let removeLoginWindowClosedListener: (() => void) | null = null;
let removeLoginWindowOpenedListener: (() => void) | null = null;
let removeLoginWindowCompletedListener: (() => void) | null = null;
let authRefreshSequence = 0;
let loginLaunchTimer: ReturnType<typeof setTimeout> | null = null;
let geminiCompletedRefreshSucceeded = false;
let geminiCompletedRefreshInFlight = false;
const GEMINI_LOGIN_REFRESH_MAX_ATTEMPTS = 4;
const GEMINI_LOGIN_REFRESH_RETRY_DELAY_MS = 1200;

function isLoginOpening(providerId: LoginProviderId) {
  return openingProviderLoginId.value === providerId;
}

function isLoginAcknowledged(providerId: LoginProviderId) {
  return acknowledgedProviderLoginId.value === providerId;
}

function isLoginActionDisabled(providerId: LoginProviderId) {
  return isLoginOpening(providerId);
}

const chatgptAuthStatusOverride = computed(() => {
  return chatStore.currentProviderId === 'chatgpt-web' ? chatgptAuthStatus.value : null;
});
const chatgptAuthMessage = computed(() => {
  if (isLoginOpening('chatgpt-web')) {
    return '正在打开 ChatGPT 登录窗口...';
  }

  if (isLoginAcknowledged('chatgpt-web')) {
    return '已请求打开 ChatGPT 登录窗口；如果未看到窗口，请检查当前桌面、Dock 或切换空间。';
  }

  return chatgptAuthStatusOverride.value === false
    ? '当前桌面宿主的 ChatGPT 登录态不可用，请先登录后再继续。'
    : '';
});
const chatgptAuthRecoveryLabel = computed(() => {
  if (isLoginOpening('chatgpt-web')) {
    return '打开中...';
  }

  if (chatgptAuthStatusOverride.value === false && isLoginAcknowledged('chatgpt-web')) {
    return '重新打开 ChatGPT';
  }

  return chatgptAuthStatusOverride.value === false ? '登录 ChatGPT' : '';
});
const hostRecoveryMessage = computed(() => {
  if (
    chatStore.historySource === 'external'
    && chatStore.activeExternalProviderId === 'gemini-web'
    && chatStore.currentHistoryErrorCode === 'AUTH_REQUIRED'
  ) {
    return isLoginOpening('gemini-web')
      ? '正在打开 Gemini 登录窗口...'
      : '当前桌面宿主的 Gemini 登录态不可用，请先登录后再继续。';
  }

  return '';
});
const hostRecoveryActionLabel = computed(() => {
  if (!hostRecoveryMessage.value) {
    return '';
  }

  if (isLoginOpening('gemini-web')) {
    return '打开中...';
  }

  if (isLoginAcknowledged('gemini-web')) {
    return '重新打开 Gemini';
  }

  return '登录 Gemini';
});
const hostRecoveryActionDisabled = computed(() => isLoginActionDisabled('gemini-web'));

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

async function requestProviderLogin(providerId: LoginProviderId): Promise<void> {
  const bridge = window.chatprismDesktop;
  if (!bridge || isLoginOpening(providerId)) {
    return;
  }

  if (providerId === 'chatgpt-web' && chatStore.currentProviderId !== 'chatgpt-web') {
    return;
  }

  if (
    providerId === 'gemini-web'
    && !(
      chatStore.historySource === 'external'
      && chatStore.activeExternalProviderId === 'gemini-web'
      && chatStore.currentHistoryErrorCode === 'AUTH_REQUIRED'
    )
  ) {
    return;
  }

  openingProviderLoginId.value = providerId;
  acknowledgedProviderLoginId.value = null;
  if (loginLaunchTimer) {
    clearTimeout(loginLaunchTimer);
  }
  loginLaunchTimer = setTimeout(() => {
    openingProviderLoginId.value = null;
    acknowledgedProviderLoginId.value = providerId;
  }, 1500);
  try {
    await bridge.openProviderLoginWindow(providerId);
  } catch (error) {
    openingProviderLoginId.value = null;
    acknowledgedProviderLoginId.value = providerId;
    console.error(`Failed to open ${providerId} login window.`, error);
  }
}

async function requestChatGPTLogin(): Promise<void> {
  await requestProviderLogin('chatgpt-web');
}

async function requestGeminiHistoryLogin(): Promise<void> {
  geminiCompletedRefreshSucceeded = false;
  geminiCompletedRefreshInFlight = false;
  await requestProviderLogin('gemini-web');
}

function waitForGeminiRefreshRetry(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function refreshGeminiHistoryAfterLogin(trigger: 'completed' | 'closed'): Promise<void> {
  if (trigger === 'closed' && (geminiCompletedRefreshInFlight || geminiCompletedRefreshSucceeded)) {
    return;
  }

  if (trigger === 'completed') {
    geminiCompletedRefreshInFlight = true;
  }

  try {
    for (let attempt = 1; attempt <= GEMINI_LOGIN_REFRESH_MAX_ATTEMPTS; attempt += 1) {
      try {
        await chatStore.loadExternalHistory('gemini-web');
        if (trigger === 'completed') {
          geminiCompletedRefreshSucceeded = true;
        }
        return;
      } catch (error) {
        const isAuthRequired = chatStore.currentHistoryErrorCode === 'AUTH_REQUIRED';
        const shouldRetry = isAuthRequired && attempt < GEMINI_LOGIN_REFRESH_MAX_ATTEMPTS;

        if (!shouldRetry) {
          return;
        }

        await waitForGeminiRefreshRetry(GEMINI_LOGIN_REFRESH_RETRY_DELAY_MS);
      }
    }
  } finally {
    if (trigger === 'completed') {
      geminiCompletedRefreshInFlight = false;
    }
  }
}

onMounted(() => {
  void (async () => {
    const providerCatalog = modelProviderRuntime.getProviderCatalog();

    try {
      if (providerCatalog.length === 0) {
        chatStore.setProviderCatalog([]);
      } else {
        chatStore.setAgentRuntime(agentRuntime);
        const storageProvider = createDesktopSyncStorageProvider({
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
          console.warn('Desktop sync hydration failed, continuing with local data only.', error);
        });
        await chatStore.initializeProviderCatalog(providerCatalog);
        await chatStore.init();
        await refreshChatGPTAuthStatus();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      chatStore.currentError = message;
      console.error('Failed to initialize desktop provider catalogs', error);
    }

    try {
      await compareStore.setRuntime(modelProviderRuntime);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      compareStore.analysisError = message;
      console.error('Failed to initialize desktop compare runtime', error);
    }
  })();

  removeLoginWindowCompletedListener = window.chatprismDesktop?.onProviderLoginCompleted((providerId: string) => {
    if (providerId === 'chatgpt-web' || providerId === 'gemini-web') {
      openingProviderLoginId.value = null;
      acknowledgedProviderLoginId.value = null;
      if (loginLaunchTimer) {
        clearTimeout(loginLaunchTimer);
        loginLaunchTimer = null;
      }
    }

    if (providerId === 'gemini-web') {
      void refreshGeminiHistoryAfterLogin('completed');
    }
  }) || null;
  removeLoginWindowClosedListener = window.chatprismDesktop?.onProviderLoginWindowClosed((providerId: string) => {
    if (providerId === 'chatgpt-web' || providerId === 'gemini-web') {
      if (openingProviderLoginId.value === providerId) {
        openingProviderLoginId.value = null;
      }
      if (acknowledgedProviderLoginId.value === providerId) {
        acknowledgedProviderLoginId.value = null;
      }
    }

    if (providerId === 'chatgpt-web') {
      void (async () => {
        const isAuthenticated = await refreshChatGPTAuthStatus();
        if (isAuthenticated) {
          await chatStore.reloadProviderModels('chatgpt-web');
        }
      })();
      return;
    }

    if (providerId === 'gemini-web') {
      void refreshGeminiHistoryAfterLogin('closed');
    }
  }) || null;
  removeLoginWindowOpenedListener = window.chatprismDesktop?.onProviderLoginWindowOpened((providerId: string) => {
    if (providerId === 'chatgpt-web' || providerId === 'gemini-web') {
      openingProviderLoginId.value = null;
      acknowledgedProviderLoginId.value = providerId as LoginProviderId;
      if (loginLaunchTimer) {
        clearTimeout(loginLaunchTimer);
        loginLaunchTimer = null;
      }
    }
  }) || null;
});

watch(() => chatStore.currentProviderId, () => {
  void refreshChatGPTAuthStatus();
});

onBeforeUnmount(() => {
  if (loginLaunchTimer) {
    clearTimeout(loginLaunchTimer);
    loginLaunchTimer = null;
  }
  removeLoginWindowOpenedListener?.();
  removeLoginWindowOpenedListener = null;
  removeLoginWindowCompletedListener?.();
  removeLoginWindowCompletedListener = null;
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
