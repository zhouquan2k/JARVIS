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
        :context-provider="props.contextProvider"
        @request-workspace-switch="onNavigateWorkspace"
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
</style>
