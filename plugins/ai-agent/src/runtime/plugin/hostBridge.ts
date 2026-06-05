import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { WorkspaceRuntimeContext } from '@plugins/ai-agent/src/internal';
import type { ProviderLoginCapability } from '@plugins/ai-agent/src/internal';
import { useChatStore } from '../../store/chat';

export interface AiAgentHostBridgeOptions {
    runtimeMode: 'web' | 'desktop' | 'extension';
    codexBaseUrl?: string;
    providerLoginCapability?: ProviderLoginCapability;
}

export interface AiAgentHostBridgeState {
    authStatusOverride: Readonly<Ref<boolean | null>>;
    authUnavailableMessage: Readonly<Ref<string>>;
    authRecoveryActionLabel: Readonly<Ref<string>>;
    authRecoveryActionDisabled: Readonly<Ref<boolean>>;
    hostRecoveryMessage: Readonly<Ref<string>>;
    hostRecoveryActionLabel: Readonly<Ref<string>>;
    hostRecoveryActionDisabled: Readonly<Ref<boolean>>;
    hasHostRecovery: Readonly<ComputedRef<boolean>>;
    requestAuthRecovery(): Promise<void>;
    requestHostRecovery(): Promise<void>;
}

const authStatusOverride = ref<boolean | null>(null);
const authUnavailableMessage = ref('');
const authRecoveryActionLabel = ref('');
const authRecoveryActionDisabled = ref(false);
const hostRecoveryMessage = ref('');
const hostRecoveryActionLabel = ref('');
const hostRecoveryActionDisabled = ref(false);
const hasHostRecovery = computed(() => hostRecoveryMessage.value.trim().length > 0);

let initialized = false;
let runtimeOptions: AiAgentHostBridgeOptions | null = null;
let runtimeContextRef: WorkspaceRuntimeContext | null = null;
let chatgptAuthStatus = ref<boolean | null>(null);
let codexAuthStatus = ref<boolean | null>(null);
let openingProviderLoginId = ref<'chatgpt-web' | 'gemini-web' | 'chatgpt-codex' | null>(null);
let acknowledgedProviderLoginId = ref<'chatgpt-web' | 'gemini-web' | 'chatgpt-codex' | null>(null);
let isCodexLoginPending = ref(false);
let authRefreshSequence = 0;
let geminiCompletedRefreshSucceeded = false;
let geminiCompletedRefreshInFlight = false;
let loginLaunchTimer: ReturnType<typeof setTimeout> | null = null;
let desktopLoginListenersBound = false;

function isLoginOpening(providerId: 'chatgpt-web' | 'gemini-web' | 'chatgpt-codex'): boolean {
    return openingProviderLoginId.value === providerId;
}

function isLoginAcknowledged(providerId: 'chatgpt-web' | 'gemini-web' | 'chatgpt-codex'): boolean {
    return acknowledgedProviderLoginId.value === providerId;
}

function setPluginMessage(id: string, message: string): void {
    runtimeContextRef?.postPluginMessage({
        id,
        level: 'info',
        message
    });
}

function getProviderLoginCapability(): ProviderLoginCapability | undefined {
    return runtimeOptions?.providerLoginCapability;
}

async function refreshChatGPTAuthStatus(): Promise<boolean | null> {
    const chatStore = useChatStore();
    if (chatStore.currentProviderId === 'chatgpt-codex') {
        chatgptAuthStatus.value = null;
        return null;
    }

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
    } catch {
        if (currentSequence === authRefreshSequence) {
            chatgptAuthStatus.value = false;
        }
        return false;
    }
}

async function refreshCodexAuthStatus(): Promise<boolean | null> {
    const chatStore = useChatStore();
    if (chatStore.currentProviderId !== 'chatgpt-codex') {
        codexAuthStatus.value = null;
        return null;
    }

    try {
        const isAuthenticated = await chatStore.checkAuth();
        codexAuthStatus.value = isAuthenticated;
        return isAuthenticated;
    } catch {
        codexAuthStatus.value = false;
        return false;
    }
}

async function requestDesktopProviderLogin(providerId: 'chatgpt-web' | 'gemini-web' | 'chatgpt-codex'): Promise<void> {
    const chatStore = useChatStore();
    const bridge = getProviderLoginCapability();
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
        await bridge.openProviderLogin(providerId);
    } catch {
        openingProviderLoginId.value = null;
        acknowledgedProviderLoginId.value = providerId;
    }
}

async function requestCodexBrowserLogin(): Promise<void> {
    const chatStore = useChatStore();
    if (chatStore.currentProviderId !== 'chatgpt-codex' || isCodexLoginPending.value || !runtimeOptions?.codexBaseUrl) {
        return;
    }

    if (runtimeOptions.runtimeMode === 'desktop') {
        openingProviderLoginId.value = 'chatgpt-codex';
        acknowledgedProviderLoginId.value = null;
        if (loginLaunchTimer) {
            clearTimeout(loginLaunchTimer);
        }
        loginLaunchTimer = setTimeout(() => {
            openingProviderLoginId.value = null;
            acknowledgedProviderLoginId.value = 'chatgpt-codex';
        }, 1500);
    }

    isCodexLoginPending.value = true;
    try {
        const response = await fetch(`${runtimeOptions.codexBaseUrl}/auth/login`, {
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

        if (runtimeOptions.runtimeMode === 'desktop') {
            openingProviderLoginId.value = null;
            acknowledgedProviderLoginId.value = 'chatgpt-codex';
            if (loginLaunchTimer) {
                clearTimeout(loginLaunchTimer);
                loginLaunchTimer = null;
            }
        }

        for (let attempt = 0; attempt < 15; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
            if (await refreshCodexAuthStatus()) {
                await chatStore.reloadProviderModels('chatgpt-codex');
                break;
            }
        }
    } catch {
        if (runtimeOptions.runtimeMode === 'desktop') {
            openingProviderLoginId.value = null;
            acknowledgedProviderLoginId.value = 'chatgpt-codex';
        }
        codexAuthStatus.value = false;
    } finally {
        isCodexLoginPending.value = false;
    }
}

function waitForGeminiRefreshRetry(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function refreshGeminiHistoryAfterLogin(trigger: 'completed' | 'closed'): Promise<void> {
    const chatStore = useChatStore();
    if (trigger === 'closed' && (geminiCompletedRefreshInFlight || geminiCompletedRefreshSucceeded)) {
        return;
    }

    if (trigger === 'completed') {
        geminiCompletedRefreshInFlight = true;
    }

    try {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
                await chatStore.loadExternalHistory('gemini-web');
                if (trigger === 'completed') {
                    geminiCompletedRefreshSucceeded = true;
                }
                return;
            } catch {
                const isAuthRequired = chatStore.currentHistoryErrorCode === 'AUTH_REQUIRED';
                if (!isAuthRequired || attempt >= 4) {
                    return;
                }

                await waitForGeminiRefreshRetry(1200);
            }
        }
    } finally {
        if (trigger === 'completed') {
            geminiCompletedRefreshInFlight = false;
        }
    }
}

function bindDesktopLoginListeners(): void {
    const bridge = getProviderLoginCapability();
    if (desktopLoginListenersBound || !bridge) {
        return;
    }

    desktopLoginListenersBound = true;
    bridge.subscribeProviderLoginCompleted((providerId: string) => {
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
    });

    bridge.subscribeProviderLoginClosed((providerId: string) => {
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
                const chatStore = useChatStore();
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
    });

    bridge.subscribeProviderLoginOpened((providerId: string) => {
        if (providerId === 'chatgpt-web' || providerId === 'gemini-web') {
            openingProviderLoginId.value = null;
            acknowledgedProviderLoginId.value = providerId;
            if (loginLaunchTimer) {
                clearTimeout(loginLaunchTimer);
                loginLaunchTimer = null;
            }
        }
    });
}

function updateBridgeState(): void {
    const chatStore = useChatStore();
    authStatusOverride.value = null;
    authUnavailableMessage.value = '';
    authRecoveryActionLabel.value = '';
    authRecoveryActionDisabled.value = false;
    hostRecoveryMessage.value = '';
    hostRecoveryActionLabel.value = '';
    hostRecoveryActionDisabled.value = false;

    if (runtimeOptions?.runtimeMode === 'desktop') {
        if (chatStore.currentProviderId === 'chatgpt-codex') {
            authStatusOverride.value = codexAuthStatus.value;
            authUnavailableMessage.value = isLoginOpening('chatgpt-codex')
                ? 'Opening the Codex sign-in flow...'
                : isLoginAcknowledged('chatgpt-codex')
                    ? 'A Codex sign-in flow was requested. If nothing opened, check your browser or pop-up settings.'
                    : codexAuthStatus.value === false
                        ? 'The Codex provider is unavailable until sign-in completes.'
                        : '';
            authRecoveryActionLabel.value = isLoginOpening('chatgpt-codex')
                ? 'Opening...'
                : codexAuthStatus.value === false
                    ? isLoginAcknowledged('chatgpt-codex')
                        ? 'Reopen Codex'
                        : 'Sign in to Codex'
                    : '';
            authRecoveryActionDisabled.value = isLoginOpening('chatgpt-codex');
        } else if (chatStore.currentProviderId === 'chatgpt-web') {
            authStatusOverride.value = chatgptAuthStatus.value;
            authUnavailableMessage.value = isLoginOpening('chatgpt-web')
                ? 'Opening the ChatGPT sign-in window...'
                : isLoginAcknowledged('chatgpt-web')
                    ? 'A ChatGPT sign-in window was requested. If you do not see it, check the current desktop, Dock, or switch spaces.'
                    : chatgptAuthStatus.value === false
                        ? 'The desktop host ChatGPT sign-in state is unavailable. Please sign in before continuing.'
                        : '';
            authRecoveryActionLabel.value = isLoginOpening('chatgpt-web')
                ? 'Opening...'
                : chatgptAuthStatus.value === false
                    ? isLoginAcknowledged('chatgpt-web')
                        ? 'Reopen ChatGPT'
                        : 'Sign in to ChatGPT'
                    : '';
            authRecoveryActionDisabled.value = isLoginOpening('chatgpt-web');
        }

        if (
            chatStore.historySource === 'external'
            && chatStore.activeExternalProviderId === 'gemini-web'
            && chatStore.currentHistoryErrorCode === 'AUTH_REQUIRED'
        ) {
            hostRecoveryMessage.value = isLoginOpening('gemini-web')
                ? 'Opening the Gemini sign-in window...'
                : 'The desktop host Gemini sign-in state is unavailable. Please sign in before continuing.';
            hostRecoveryActionLabel.value = isLoginOpening('gemini-web')
                ? 'Opening...'
                : isLoginAcknowledged('gemini-web')
                    ? 'Reopen Gemini'
                    : 'Sign in to Gemini';
            hostRecoveryActionDisabled.value = isLoginOpening('gemini-web');
        }
    } else if (chatStore.currentProviderId === 'chatgpt-codex') {
        authStatusOverride.value = codexAuthStatus.value;
        authUnavailableMessage.value = isCodexLoginPending.value
            ? '正在打开 Codex 登录流程...'
            : codexAuthStatus.value === false
                ? 'Codex provider 当前未认证，请先完成登录后再继续。'
                : '';
        authRecoveryActionLabel.value = chatStore.currentProviderId === 'chatgpt-codex' && codexAuthStatus.value === false
            ? isCodexLoginPending.value ? '打开中...' : '登录 Codex'
            : '';
        authRecoveryActionDisabled.value = isCodexLoginPending.value;
    }

    setPluginMessage('ai-agent-auth-status', authUnavailableMessage.value);
    setPluginMessage('ai-agent-host-status', hostRecoveryMessage.value);
}

export function initializeAiAgentHostBridge(
    options: AiAgentHostBridgeOptions,
    runtimeContext: WorkspaceRuntimeContext
): void {
    runtimeOptions = options;
    runtimeContextRef = runtimeContext;
    if (initialized) {
        updateBridgeState();
        return;
    }

    initialized = true;
    const chatStore = useChatStore();

    runtimeContext.subscribeHostEvent((event) => {
        if (event.type === 'unhandled-error') {
            chatStore.reportUnhandledBackendError(event.message);
        }
    });

    if (runtimeOptions?.runtimeMode === 'desktop') {
        bindDesktopLoginListeners();
    }

    watch(
        () => [
            chatStore.currentProviderId,
            chatStore.historySource,
            chatStore.activeExternalProviderId,
            chatStore.currentHistoryErrorCode,
            chatgptAuthStatus.value,
            codexAuthStatus.value,
            openingProviderLoginId.value,
            acknowledgedProviderLoginId.value,
            isCodexLoginPending.value
        ] as const,
        () => {
            updateBridgeState();
        },
        { immediate: true }
    );

    watch(
        () => [chatStore.currentProviderId] as const,
        async () => {
            await refreshChatGPTAuthStatus();
            await refreshCodexAuthStatus();
            updateBridgeState();
        },
        { immediate: true }
    );
}

export function useAiAgentHostBridge(): AiAgentHostBridgeState {
    return {
        authStatusOverride,
        authUnavailableMessage,
        authRecoveryActionLabel,
        authRecoveryActionDisabled,
        hostRecoveryMessage,
        hostRecoveryActionLabel,
        hostRecoveryActionDisabled,
        hasHostRecovery,
        async requestAuthRecovery() {
            const chatStore = useChatStore();
            if (runtimeOptions?.runtimeMode === 'desktop') {
                if (chatStore.currentProviderId === 'chatgpt-codex') {
                    await requestCodexBrowserLogin();
                } else {
                    await requestDesktopProviderLogin('chatgpt-web');
                }
                await refreshChatGPTAuthStatus();
                await refreshCodexAuthStatus();
                return;
            }

            await requestCodexBrowserLogin();
        },
        async requestHostRecovery() {
            if (runtimeOptions?.runtimeMode !== 'desktop') {
                return;
            }

            await requestDesktopProviderLogin('gemini-web');
            if (geminiCompletedRefreshInFlight || geminiCompletedRefreshSucceeded) {
                return;
            }

            geminiCompletedRefreshInFlight = true;
            try {
                const chatStore = useChatStore();
                await chatStore.submitExternalHistoryQuery();
                geminiCompletedRefreshSucceeded = true;
            } catch {
                geminiCompletedRefreshSucceeded = false;
            } finally {
                geminiCompletedRefreshInFlight = false;
            }
        }
    };
}
