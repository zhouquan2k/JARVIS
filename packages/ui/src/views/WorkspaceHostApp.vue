<template>
  <div class="app-shell">
    <AppTopBar
      :is-compare-mode="isCompareMode"
      :compare-stage="compareStore.stage"
      :active-workspace-path="activeWorkspacePath"
      :workspace-options="PRIMARY_WORKSPACE_ROUTES"
      :show-node-history-controls="isKnowledgeMode"
      :can-go-back-node-history="documentStore.canGoBackNodeHistory"
      :can-go-forward-node-history="documentStore.canGoForwardNodeHistory"
      @navigate-workspace="onNavigateWorkspace"
      @go-back-node-history="onGoBackNodeHistory"
      @go-forward-node-history="onGoForwardNodeHistory"
    />
    <div
      v-if="chatStore.currentError"
      class="global-error-banner"
      data-testid="workspace-global-error"
      role="alert"
    >
      <span class="global-error-banner__message">{{ chatStore.currentError }}</span>
      <button
        type="button"
        class="global-error-banner__close"
        data-testid="workspace-global-error-close"
        aria-label="Close error"
        @click="chatStore.clearCurrentError()"
      >
        ×
      </button>
    </div>
    <main class="view-host">
      <DocumentWorkspaceView
        v-if="isKnowledgeMode"
        :context-provider="props.contextProvider"
        @request-workspace-switch="onNavigateWorkspace"
      />
      <AllTasksWorkspaceView
        v-else-if="isAllTasksMode"
        :context-provider="props.contextProvider"
      />
      <ConversationWorkspaceView
        v-else
        :is-compare-mode="isCompareMode"
        :context-provider="props.contextProvider"
        :show-history-source-switch="props.showHistorySourceSwitch"
        :auth-status-override="props.authStatusOverride"
        :auth-unavailable-message="props.authUnavailableMessage"
        :auth-recovery-action-label="props.authRecoveryActionLabel"
        :auth-recovery-action-disabled="props.authRecoveryActionDisabled"
        :host-recovery-message="props.hostRecoveryMessage"
        :host-recovery-action-label="props.hostRecoveryActionLabel"
        :host-recovery-action-disabled="props.hostRecoveryActionDisabled"
        @request-workspace-switch="onNavigateWorkspace"
        @request-compare-mode="openCompareMode"
        @request-auth-recovery="emit('request-auth-recovery')"
        @request-host-recovery="emit('request-host-recovery')"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import type { IContextProvider } from '@packages/core/src';
import AppTopBar from '../components/AppTopBar.vue';
import { useChatStore } from '../store/chat';
import { useCompareStore } from '../store/compare';
import { useDocumentWorkspaceStore } from '../store/documentWorkspace';
import AllTasksWorkspaceView from './AllTasksWorkspaceView.vue';
import ConversationWorkspaceView from './ConversationWorkspaceView.vue';
import DocumentWorkspaceView from './DocumentWorkspaceView.vue';
import { PRIMARY_WORKSPACE_ROUTES, type ChatRoutePath } from '../routes';

const props = withDefaults(defineProps<{
  currentRoutePath: ChatRoutePath;
  navigateTo: (path: ChatRoutePath) => void;
  contextProvider: IContextProvider;
  showHistorySourceSwitch?: boolean;
  authStatusOverride?: boolean | null;
  authUnavailableMessage?: string;
  authRecoveryActionLabel?: string;
  authRecoveryActionDisabled?: boolean;
  hostRecoveryMessage?: string;
  hostRecoveryActionLabel?: string;
  hostRecoveryActionDisabled?: boolean;
}>(), {
  showHistorySourceSwitch: false,
  authStatusOverride: null,
  authUnavailableMessage: undefined,
  authRecoveryActionLabel: undefined,
  authRecoveryActionDisabled: false,
  hostRecoveryMessage: '',
  hostRecoveryActionLabel: '',
  hostRecoveryActionDisabled: false
});

const emit = defineEmits<{
  (event: 'request-auth-recovery'): void;
  (event: 'request-host-recovery'): void;
}>();

const chatStore = useChatStore();
const documentStore = useDocumentWorkspaceStore();
const compareStore = useCompareStore();
const isCompareMode = computed(() => props.currentRoutePath === '/compare');
const isKnowledgeMode = computed(() => props.currentRoutePath === '/');
const isAllTasksMode = computed(() => props.currentRoutePath === '/all-tasks');
const activeWorkspacePath = computed<ChatRoutePath>(() => props.currentRoutePath === '/compare' ? '/chat' : props.currentRoutePath);

function syncWorkspaceMode(path: ChatRoutePath): void {
  chatStore.setWorkspaceMode(path === '/' ? 'agent' : 'conversation');
}

function openCompareMode() {
  compareStore.startNewCompare();
  props.navigateTo('/compare');
}

async function onNavigateWorkspace(path: ChatRoutePath) {
  syncWorkspaceMode(path);
  if (path === '/chat' && path !== props.currentRoutePath) {
    chatStore.saveAgentViewStatus({
      selectedNodePath: documentStore.selectedNodePath,
      activePath: documentStore.activePath,
      activeConversationId: chatStore.currentConversation?.id ?? null
    });
    if (documentStore.activeAgent) {
      chatStore.saveWorkspaceAgentContext(documentStore.activeAgent);
    }
    chatStore.setSidebarCollapsed(true);
    await chatStore.applyWorkspaceAgentContextSelection();
  }
  props.navigateTo(path);
}

async function onGoBackNodeHistory(): Promise<void> {
  if (!isKnowledgeMode.value) {
    return;
  }

  await documentStore.goBackNodeHistory();
}

async function onGoForwardNodeHistory(): Promise<void> {
  if (!isKnowledgeMode.value) {
    return;
  }

  await documentStore.goForwardNodeHistory();
}

watch(
  () => props.currentRoutePath,
  (path) => {
    syncWorkspaceMode(path);
  },
  { immediate: true }
);
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
  height: 100%;
  min-height: 0;
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

.global-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(248, 113, 113, 0.35);
  background: rgba(127, 29, 29, 0.92);
  color: #fee2e2;
  font-size: 13px;
  line-height: 1.45;
}

.global-error-banner__message {
  min-width: 0;
}

.global-error-banner__close {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
}
</style>
