<template>
  <WorkspaceHostApp
    :current-route-path="currentRoute.path"
    :navigate-to="navigateTo"
    :context-provider="contextProvider"
    :show-history-source-switch="true"
    :auth-status-override="chatgptAuthStatusOverride"
    :auth-unavailable-message="chatgptAuthMessage"
    :auth-recovery-action-label="chatgptAuthRecoveryLabel"
    :auth-recovery-action-disabled="isLoginActionDisabled('chatgpt-web')"
    :host-recovery-message="hostRecoveryMessage"
    :host-recovery-action-label="hostRecoveryActionLabel"
    :host-recovery-action-disabled="hostRecoveryActionDisabled"
    @request-auth-recovery="requestChatGPTLogin"
    @request-host-recovery="requestGeminiHistoryLogin"
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
import { currentRoute, navigateTo } from './router';
import { createDesktopContextProvider } from './context/createDesktopContextProvider';
import { agentRuntime, createDesktopHistoryProviders, modelProviderRuntime } from './modelProviderRuntime';
import { createDesktopSyncStorageProvider } from './sync';

const chatStore = useChatStore();
const compareStore = useCompareStore();
const historyProviders = createDesktopHistoryProviders();
type LoginProviderId = 'chatgpt-web' | 'gemini-web';
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
let removeUnhandledErrorFallback: (() => void) | null = null;
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
    return 'Opening the ChatGPT sign-in window...';
  }

  if (isLoginAcknowledged('chatgpt-web')) {
    return 'A ChatGPT sign-in window was requested. If you do not see it, check the current desktop, Dock, or switch spaces.';
  }

  return chatgptAuthStatusOverride.value === false
    ? 'The desktop host ChatGPT sign-in state is unavailable. Please sign in before continuing.'
    : '';
});
const chatgptAuthRecoveryLabel = computed(() => {
  if (isLoginOpening('chatgpt-web')) {
    return 'Opening...';
  }

  if (chatgptAuthStatusOverride.value === false && isLoginAcknowledged('chatgpt-web')) {
    return 'Reopen ChatGPT';
  }

  return chatgptAuthStatusOverride.value === false ? 'Sign in to ChatGPT' : '';
});
const hostRecoveryMessage = computed(() => {
  if (
    chatStore.historySource === 'external'
    && chatStore.activeExternalProviderId === 'gemini-web'
    && chatStore.currentHistoryErrorCode === 'AUTH_REQUIRED'
  ) {
    return isLoginOpening('gemini-web')
      ? 'Opening the Gemini sign-in window...'
      : 'The desktop host Gemini sign-in state is unavailable. Please sign in before continuing.';
  }

  return '';
});
const hostRecoveryActionLabel = computed(() => {
  if (!hostRecoveryMessage.value) {
    return '';
  }

  if (isLoginOpening('gemini-web')) {
    return 'Opening...';
  }

  if (isLoginAcknowledged('gemini-web')) {
    return 'Reopen Gemini';
  }

  return 'Sign in to Gemini';
});
const hostRecoveryActionDisabled = computed(() => isLoginActionDisabled('gemini-web'));

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
  removeUnhandledErrorFallback = installGlobalUnhandledErrorFallback({
    reportError: (message) => {
      chatStore.reportUnhandledBackendError(message);
    }
  });

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
  removeUnhandledErrorFallback?.();
  removeUnhandledErrorFallback = null;
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
