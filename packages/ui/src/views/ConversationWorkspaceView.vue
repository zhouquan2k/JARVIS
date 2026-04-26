<template>
  <section class="workspace-shell" data-testid="conversation-workspace">
    <ConversationSidebar
      :collapsed="chatStore.sidebarCollapsed"
      :history-source="chatStore.historySource"
      :show-history-source-switch="showHistorySourceSwitch"
      :local-items="chatStore.filteredLocalConversations"
      :local-conversation-filter="chatStore.localConversationFilter"
      :external-providers="chatStore.historyProviders"
      :external-items="chatStore.externalHistoryItems"
      :external-history-loading="chatStore.isExternalHistoryLoading"
      :external-history-query="chatStore.externalHistoryQuery"
      :show-external-history-search="showExternalHistorySearch"
      :external-history-search-placeholder="externalHistorySearchPlaceholder"
      :external-preview-loading-id="chatStore.externalPreviewLoadingId"
      :active-external-provider-id="chatStore.activeExternalProviderId"
      :active-local-id="chatStore.isPreviewing ? null : chatStore.currentConversation?.id"
      :active-external-id="chatStore.isPreviewing ? chatStore.previewConversation?.externalId : null"
      :is-compare-mode="isCompareMode"
      :agent-binding-options="agentBindingOptions"
      :agent-binding-loading="agentBindingLoading"
      :agent-binding-error="agentBindingError"
      :agent-binding-notice="agentBindingNotice"
      :agent-binding-notice-tone="agentBindingNoticeTone"
      :agent-binding-submitting="agentBindingSubmitting"
      @toggle-collapse="chatStore.setSidebarCollapsed"
      @switch-source="onSwitchSource"
      @select-external-provider="onSelectExternalProvider"
      @select-local="onSelectLocal"
      @delete-local="onDeleteLocal"
      @toggle-local-star="chatStore.toggleConversationStar"
      @set-local-filter="chatStore.setLocalConversationFilter"
      @select-external="onSelectExternal"
      @update-external-query="chatStore.setExternalHistoryQuery"
      @submit-external-query="chatStore.submitExternalHistoryQuery"
      @clear-external-query="chatStore.clearExternalHistoryQuery"
      @open-local-agent-binding="onOpenLocalAgentBinding"
      @bind-local-agent="onBindLocalAgent"
      @new-chat="onNewChat"
      @new-compare="onNewCompare"
    />

    <div class="workspace-main" :class="{ 'compare-mode': isCompareMode }">
      <CompareChatView v-if="isCompareMode" />
      <NormalChatView
        v-else
        class="workspace-thread"
        :show-question-index="true"
        :auth-status-override="authStatusOverride"
        :auth-unavailable-message="authUnavailableMessage"
        :auth-recovery-action-label="authRecoveryActionLabel"
        :auth-recovery-action-disabled="authRecoveryActionDisabled"
        :host-recovery-message="hostRecoveryMessage"
        :host-recovery-action-label="hostRecoveryActionLabel"
        :host-recovery-action-disabled="hostRecoveryActionDisabled"
        @request-workspace-switch="emit('request-workspace-switch', $event)"
        @request-auth-recovery="emit('request-auth-recovery')"
        @request-host-recovery="emit('request-host-recovery')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, type PropType } from 'vue';
import '../theme/chatgpt-dark.css';
import CompareChatView from './CompareChatView.vue';
import ConversationSidebar from '../components/ConversationSidebar.vue';
import NormalChatView from './NormalChatView.vue';
import { useChatStore } from '../store/chat';
import {
  DEFAULT_WORKSPACE_AGENT_KEY,
  type IContextProvider,
  type ExternalHistoryProviderId,
  type ResolvedAgentConfig,
  type WorkspaceContext
} from '@packages/core/src';
import type { ChatRoutePath } from '../routes';
import { useWorkspaceI18n } from '../i18n';

type AgentBindingOption = {
  key: string | null;
  label: string;
  title: string;
};

const props = defineProps({
  isCompareMode: {
    type: Boolean,
    required: true
  },
  showHistorySourceSwitch: {
    type: Boolean,
    default: false
  },
  authStatusOverride: {
    type: null as unknown as PropType<boolean | null>,
    default: null
  },
  authUnavailableMessage: {
    type: String,
    default: undefined
  },
  authRecoveryActionLabel: {
    type: String,
    default: undefined
  },
  authRecoveryActionDisabled: {
    type: Boolean,
    default: false
  },
  contextProvider: {
    type: null as unknown as PropType<IContextProvider | null>,
    default: null
  },
  hostRecoveryMessage: {
    type: String,
    default: ''
  },
  hostRecoveryActionLabel: {
    type: String,
    default: ''
  },
  hostRecoveryActionDisabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits<{
  (event: 'request-workspace-switch', path: ChatRoutePath): void;
  (event: 'request-compare-mode'): void;
  (event: 'request-auth-recovery'): void;
  (event: 'request-host-recovery'): void;
}>();

const chatStore = useChatStore();
const { t } = useWorkspaceI18n();
const activeExternalProviderFeatures = computed(() => chatStore.activeExternalProvider?.features || null);
const agentBindingOptions = ref<AgentBindingOption[]>([]);
const agentBindingLoading = ref(false);
const agentBindingError = ref<string | null>(null);
const agentBindingNotice = ref<string | null>(null);
const agentBindingNoticeTone = ref<'info' | 'success' | 'error'>('info');
const agentBindingSubmitting = ref(false);
let agentBindingLoadPromise: Promise<void> | null = null;
let agentBindingNoticeTimer: ReturnType<typeof setTimeout> | null = null;
const showExternalHistorySearch = computed(() => {
  return chatStore.historySource === 'external' && activeExternalProviderFeatures.value?.historySearch === true;
});
const externalHistorySearchPlaceholder = computed(() => {
  return activeExternalProviderFeatures.value?.historySearchPlaceholder || t('shared.externalSearchPlaceholder');
});

function resolveAgentBindingLabel(agent: ResolvedAgentConfig, key: string): string {
  const name = agent.name?.trim() || t('shared.untitled');
  if (key === DEFAULT_WORKSPACE_AGENT_KEY) {
    return `${name} (${t('shared.defaultAgentSuffix')})`;
  }

  return name;
}

function resolveAgentBindingTitle(agent: ResolvedAgentConfig, key: string): string {
  const scopePath = agent.scopePath?.trim() || key;
  return t('shared.agentScope', { scope: scopePath });
}

function buildAgentBindingOptions(context: WorkspaceContext): AgentBindingOption[] {
  const entries = Object.entries(context.agentConfigs)
    .filter((entry): entry is [string, ResolvedAgentConfig] => !!entry[1])
    .sort(([leftKey, leftAgent], [rightKey, rightAgent]) => {
      const leftScope = leftAgent.scopePath || leftKey;
      const rightScope = rightAgent.scopePath || rightKey;
      return leftScope.localeCompare(rightScope);
    });

  const options: AgentBindingOption[] = [
    {
      key: null,
      label: t('shared.bindingNoSelection'),
      title: t('shared.keepAsNormalConversation')
    }
  ];

  const rootAgent = context.agentConfigs[DEFAULT_WORKSPACE_AGENT_KEY];
  if (rootAgent) {
    options.push({
      key: DEFAULT_WORKSPACE_AGENT_KEY,
      label: resolveAgentBindingLabel(rootAgent, DEFAULT_WORKSPACE_AGENT_KEY),
      title: resolveAgentBindingTitle(rootAgent, DEFAULT_WORKSPACE_AGENT_KEY)
    });
  }

  for (const [key, agent] of entries) {
    if (key === DEFAULT_WORKSPACE_AGENT_KEY) {
      continue;
    }

    options.push({
      key,
      label: resolveAgentBindingLabel(agent, key),
      title: resolveAgentBindingTitle(agent, key)
    });
  }

  return options;
}

async function ensureAgentBindingOptionsLoaded(): Promise<void> {
  if (agentBindingOptions.value.length > 0 || agentBindingLoadPromise) {
    return agentBindingLoadPromise ?? Promise.resolve();
  }

  const provider = props.contextProvider;
  if (!provider) {
    agentBindingError.value = t('shared.noAgentBindingProvider');
    agentBindingOptions.value = [];
    return;
  }

  agentBindingLoading.value = true;
  agentBindingError.value = null;
  agentBindingLoadPromise = (async () => {
    await provider.initializeAccess();
    const context = await provider.getContext();
    agentBindingOptions.value = buildAgentBindingOptions(context);
  })()
    .catch((error) => {
      agentBindingOptions.value = [];
      agentBindingError.value = error instanceof Error ? error.message : t('shared.agentBindingLoadingFailed');
    })
    .finally(() => {
      agentBindingLoading.value = false;
      agentBindingLoadPromise = null;
    });

  await agentBindingLoadPromise;
}

function setAgentBindingNotice(message: string | null, tone: 'info' | 'success' | 'error' = 'info', autoClear = true) {
  if (agentBindingNoticeTimer) {
    clearTimeout(agentBindingNoticeTimer);
    agentBindingNoticeTimer = null;
  }

  agentBindingNotice.value = message;
  agentBindingNoticeTone.value = tone;

  if (message && autoClear) {
    agentBindingNoticeTimer = setTimeout(() => {
      agentBindingNotice.value = null;
      agentBindingNoticeTimer = null;
    }, 4000);
  }
}

function resolveAgentBindingLabelByKey(agentKey: string | null): string {
  if (agentKey === null) {
    return t('shared.bindingNoSelection');
  }

  return agentBindingOptions.value.find((option) => option.key === agentKey)?.label ?? agentKey;
}

function requestWorkspaceSwitch(path: ChatRoutePath) {
  emit('request-workspace-switch', path);
}

async function onSwitchSource(source: 'local' | 'external') {
  await chatStore.setHistorySource(source);
}

async function onSelectLocal(id: string) {
  if (props.isCompareMode) {
    requestWorkspaceSwitch('/chat');
  }
  await chatStore.selectLocalConversation(id);
}

async function onDeleteLocal(id: string) {
  if (props.isCompareMode) {
    requestWorkspaceSwitch('/chat');
  }
  await chatStore.deleteLocalConversation(id);
}

async function onSelectExternal(id: string) {
  if (props.isCompareMode) {
    requestWorkspaceSwitch('/chat');
  }
  await chatStore.previewExternalConversation(chatStore.activeExternalProviderId, id);
}

async function onSelectExternalProvider(providerId: ExternalHistoryProviderId) {
  if (props.isCompareMode) {
    requestWorkspaceSwitch('/chat');
  }
  await chatStore.setActiveExternalProvider(providerId);
}

async function onNewChat() {
  if (props.isCompareMode) {
    requestWorkspaceSwitch('/chat');
  }
  await chatStore.startNewConversation({ boundNodeName: null });
}

function onNewCompare() {
  emit('request-compare-mode');
}

function onOpenLocalAgentBinding(): void {
  setAgentBindingNotice(null);
  void ensureAgentBindingOptionsLoaded();
}

async function onBindLocalAgent(payload: { conversationId: string; agentKey: string | null }): Promise<void> {
  agentBindingSubmitting.value = true;
  setAgentBindingNotice(t('shared.bindingInProgress'), 'info', false);
  try {
    await chatStore.bindConversationToAgent(payload.conversationId, payload.agentKey);
    setAgentBindingNotice(
      t('shared.bindingSuccess', { label: resolveAgentBindingLabelByKey(payload.agentKey) }),
      'success'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : t('shared.bindingFailed');
    setAgentBindingNotice(message, 'error', false);
  } finally {
    agentBindingSubmitting.value = false;
  }
}

onBeforeUnmount(() => {
  if (agentBindingNoticeTimer) {
    clearTimeout(agentBindingNoticeTimer);
    agentBindingNoticeTimer = null;
  }
});
</script>

<style scoped>
.workspace-shell {
  display: flex;
  flex: 1;
  width: 100%;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 28%),
    radial-gradient(circle at bottom right, rgba(56, 189, 248, 0.08), transparent 24%),
    linear-gradient(180deg, #090b10 0%, #11151d 100%);
}

.workspace-main {
  display: flex;
  flex: 1;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.workspace-main.compare-mode {
  background:
    radial-gradient(circle at top left, rgba(120, 128, 150, 0.1), transparent 34%),
    radial-gradient(circle at bottom right, rgba(71, 85, 105, 0.12), transparent 28%),
    linear-gradient(180deg, #1a1d24 0%, #20242d 100%);
}

.workspace-main > * {
  min-width: 0;
  min-height: 0;
}

.workspace-thread {
  flex: 1;
}

@media (max-width: 920px) {
  .workspace-shell {
    flex-direction: column;
  }
}
</style>
