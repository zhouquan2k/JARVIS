<template>
  <section class="agent-conversation-panel" data-testid="agent-conversation-panel">
    <header
      v-if="showToolbar"
      class="agent-conversation-panel__toolbar"
      data-testid="agent-conversation-toolbar"
    >
      <button
        type="button"
        class="agent-conversation-panel__icon-btn"
        data-testid="agent-conversation-back"
        :class="{ 'agent-conversation-panel__icon-btn--hidden': !showBackButton }"
        :tabindex="showBackButton ? 0 : -1"
        :aria-hidden="!showBackButton"
        :disabled="!showBackButton"
        @click="openConversationList"
      >
        <ArrowLeft :size="16" />
      </button>
      <h3
        v-if="toolbarTitle"
        class="agent-conversation-panel__title"
        data-testid="agent-conversation-title"
      >
        {{ toolbarTitle }}
      </h3>
      <div v-else class="agent-conversation-panel__title-spacer" aria-hidden="true" />
      <button
        type="button"
        class="agent-conversation-panel__icon-btn"
        data-testid="agent-conversation-expand"
        :title="t('shared.expandConversation')"
        :aria-label="t('shared.expandConversation')"
        @click="switchWorkspace('/chat')"
      >
        <PanelRightOpen :size="16" />
      </button>
      <button
        type="button"
        class="agent-conversation-panel__icon-btn"
        data-testid="agent-conversation-list-plus"
        @click="createDocumentConversation"
      >
        <Plus :size="16" />
      </button>
    </header>

    <AgentDocumentConversationList
      v-if="panelMode === 'list' && hasConversationListContext"
      :conversations="listConversations"
      :active-conversation-id="chatStore.currentConversation?.id ?? null"
      :loading="isLoading"
      :error="currentError"
      :empty-message="listEmptyMessage"
      @open="openConversationDetail"
    />
    <NormalChatView v-else class="agent-conversation-panel__detail" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowLeft, PanelRightOpen, Plus } from 'lucide-vue-next';
import type { ContextDocument, Conversation, IContextProvider } from '@packages/core/src';
import AgentDocumentConversationList from './AgentDocumentConversationList.vue';
import NormalChatView from '../views/NormalChatView.vue';
import { useChatStore } from '../store/chat';
import type { ChatRoutePath } from '../routes';
import { useWorkspaceI18n } from '../i18n';
import { formatConversationTitle, extractNodeNameFromPath } from '../utils/conversationTitle';

type PanelMode = 'list' | 'detail';

const props = defineProps<{
  activeAgentKey?: string | null;
  activePath?: string | null;
  selectedNodePath?: string | null;
  activeDocument?: ContextDocument | null;
  showAgentConversationList?: boolean;
  contextProvider?: IContextProvider | null;
  restoreConversationId?: string | null;
}>();

const chatStore = useChatStore();
const { t } = useWorkspaceI18n();
const emit = defineEmits<{
  (event: 'request-workspace-switch', path: ChatRoutePath): void;
}>();
const panelMode = ref<PanelMode>('detail');
const documentConversations = ref<Conversation[]>([]);
const isLoading = ref(false);
const currentError = ref<string | null>(null);
const pendingRestoreConversationId = ref<string | null>(props.restoreConversationId ?? null);
let documentConversationLoadToken = 0;

const activeDocumentPath = computed(() => props.activeDocument?.path?.trim() || '');
const isDocumentSelection = computed(() => !!activeDocumentPath.value);
const activeAgentKey = computed(() => props.activeAgentKey?.trim() || '');
const isAgentDirectorySelection = computed(() => !activeDocumentPath.value && !!activeAgentKey.value && props.showAgentConversationList === true);
const hasConversationListContext = computed(() => isDocumentSelection.value || isAgentDirectorySelection.value);
const currentConversationTitle = computed(() => {
  return formatConversationTitle(
    chatStore.currentConversation?.title,
    chatStore.currentConversation?.boundNodeName,
    t('shared.newChat')
  );
});
const showToolbar = computed(() => hasConversationListContext.value);
const showBackButton = computed(() => panelMode.value === 'detail' && hasConversationListContext.value);
const toolbarTitle = computed(() => panelMode.value === 'detail' && hasConversationListContext.value ? currentConversationTitle.value : '');
const documentScopedConversations = computed(() => {
  const scopedAgentKey = activeAgentKey.value;
  const merged = [...documentConversations.value];
  const currentConversation = chatStore.currentConversation;
  if (
    currentConversation
    && !merged.some((conversation) => conversation.id === currentConversation.id)
    && currentConversation.documentPaths?.includes(activeDocumentPath.value)
    && (!scopedAgentKey || currentConversation.agentKey === scopedAgentKey)
  ) {
    merged.unshift(currentConversation);
  }

  return merged
    .filter((conversation) => {
      if (conversation.compare || conversation.sync?.deleted) {
        return false;
      }

      if (!conversation.documentPaths?.includes(activeDocumentPath.value)) {
        return false;
      }

      return !scopedAgentKey || conversation.agentKey === scopedAgentKey;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
});
const agentScopedConversations = computed(() => {
  if (!activeAgentKey.value) {
    return [];
  }

  return chatStore.getConversationsByAgent(activeAgentKey.value)
    .sort((left, right) => right.updatedAt - left.updatedAt);
});
const listConversations = computed(() => {
  return isDocumentSelection.value ? documentScopedConversations.value : agentScopedConversations.value;
});
const listEmptyMessage = computed(() => {
  return isDocumentSelection.value ? t('shared.currentDocumentUnavailable') : t('shared.currentAgentUnavailable');
});

async function loadDocumentConversations(path: string): Promise<void> {
    const provider = props.contextProvider;
    const loadToken = ++documentConversationLoadToken;
    if (!provider) {
        documentConversations.value = [];
        currentError.value = t('shared.noAgentBindingProvider');
        return;
  }

  isLoading.value = true;
  currentError.value = null;
  try {
    const conversations = await provider.getConversations({ documentPath: path });
    if (loadToken !== documentConversationLoadToken || path !== activeDocumentPath.value) {
      return;
    }

    documentConversations.value = conversations;
  } catch (error) {
    if (loadToken !== documentConversationLoadToken) {
      return;
    }
    documentConversations.value = [];
    currentError.value = error instanceof Error ? error.message : t('shared.agentBindingLoadingFailed');
  } finally {
    if (loadToken === documentConversationLoadToken) {
      isLoading.value = false;
    }
  }
}

function openConversationList(): void {
  if (!hasConversationListContext.value) {
    panelMode.value = 'detail';
    return;
  }

  panelMode.value = 'list';
  if (activeDocumentPath.value) {
    void loadDocumentConversations(activeDocumentPath.value);
  }
}

async function openConversationDetail(conversationId: string): Promise<void> {
  await chatStore.selectLocalConversation(conversationId);
  if (chatStore.currentConversation?.id !== conversationId) {
    const conversationSnapshot = listConversations.value.find((conversation) => conversation.id === conversationId);
    if (conversationSnapshot) {
      await chatStore.activateConversationSnapshot(conversationSnapshot);
    }
  }
  panelMode.value = 'detail';
}

async function createDocumentConversation(): Promise<void> {
  await chatStore.startNewConversation({
    boundNodeName: extractNodeNameFromPath(props.selectedNodePath ?? props.activeDocument?.path ?? props.activePath ?? null)
  });
  panelMode.value = 'detail';
}

function switchWorkspace(path: ChatRoutePath): void {
  emit('request-workspace-switch', path);
}

function consumeRestoreConversationId(): void {
  pendingRestoreConversationId.value = null;
}

function syncPanelStateFromSelection(): void {
  if (hasConversationListContext.value) {
    if (pendingRestoreConversationId.value) {
      if (chatStore.currentConversation?.id === pendingRestoreConversationId.value) {
        panelMode.value = 'detail';
      }
      return;
    }

    panelMode.value = 'list';
    if (activeDocumentPath.value) {
      void loadDocumentConversations(activeDocumentPath.value);
    } else {
      documentConversations.value = [];
      currentError.value = null;
      isLoading.value = false;
      documentConversationLoadToken += 1;
    }
    return;
  }

  panelMode.value = 'detail';
  documentConversations.value = [];
  currentError.value = null;
  documentConversationLoadToken += 1;
}

watch(
  () => props.restoreConversationId ?? null,
  (restoreConversationId) => {
    pendingRestoreConversationId.value = restoreConversationId;
    syncPanelStateFromSelection();
  },
  { immediate: true, flush: 'sync' }
);

watch(
  () => [
    props.selectedNodePath ?? null,
    props.activePath ?? null,
    activeDocumentPath.value,
    activeAgentKey.value,
    props.showAgentConversationList === true,
    props.contextProvider ?? null
  ] as const,
  () => {
    syncPanelStateFromSelection();
  },
  { immediate: true, flush: 'sync' }
);

watch(
  () => [chatStore.currentConversation?.id ?? null, chatStore.currentConversation?.updatedAt ?? null, pendingRestoreConversationId.value] as const,
  () => {
    if (
      hasConversationListContext.value
      && pendingRestoreConversationId.value
      && chatStore.currentConversation?.id === pendingRestoreConversationId.value
    ) {
      panelMode.value = 'detail';
      consumeRestoreConversationId();
      return;
    }

    if (panelMode.value === 'list' && activeDocumentPath.value) {
      void loadDocumentConversations(activeDocumentPath.value);
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.agent-conversation-panel {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.agent-conversation-panel__toolbar {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 36px 36px;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(8, 15, 26, 0.9);
}

.agent-conversation-panel__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 8px;
  color: rgba(226, 232, 240, 0.86);
  background: transparent;
  cursor: pointer;
}

.agent-conversation-panel__icon-btn:hover,
.agent-conversation-panel__icon-btn:focus-visible {
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
}

.agent-conversation-panel__icon-btn:disabled {
  cursor: default;
}

.agent-conversation-panel__icon-btn--hidden {
  visibility: hidden;
  pointer-events: none;
}

.agent-conversation-panel__title {
  margin: 0;
  color: #f8fafc;
  font-size: 14px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-conversation-panel__title-spacer {
  grid-column: 2;
  min-width: 0;
  min-height: 1px;
}

.agent-conversation-panel__detail {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
