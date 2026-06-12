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
      <div class="agent-conversation-panel__title-wrap">
        <h3
          v-if="toolbarTitle"
          class="agent-conversation-panel__title"
          data-testid="agent-conversation-title"
        >
          {{ toolbarTitle }}
        </h3>
      </div>
      <div class="agent-conversation-panel__tools" data-testid="agent-conversation-tools">
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
          v-if="showRebindConversationAction"
          type="button"
          class="agent-conversation-panel__icon-btn"
          data-testid="agent-conversation-rebind-document"
          :title="t('shared.rebindConversationDocument')"
          :aria-label="t('shared.rebindConversationDocument')"
          :disabled="!canRebindConversationDocument"
          @click="toggleProjectDocumentPicker"
        >
          <Files :size="16" />
        </button>
        <button
          v-if="showRenameConversationAction"
          type="button"
          class="agent-conversation-panel__icon-btn"
          data-testid="agent-conversation-rename"
          :title="t('shared.renameConversation')"
          :aria-label="t('shared.renameConversation')"
          @click="startRenameCurrentConversation"
        >
          <Pencil :size="16" />
        </button>
        <button
          v-if="showArchiveConversationAction"
          type="button"
          class="agent-conversation-panel__icon-btn"
          :class="{ 'agent-conversation-panel__icon-btn--highlighted': isArchiveConversationHighlighted }"
          data-testid="agent-conversation-archive"
          :title="t('shared.archiveConversation')"
          :aria-label="t('shared.archiveConversation')"
          :disabled="isArchiveConversationDisabled"
          @click="archiveConversationFromToolbar"
        >
          <Archive :size="16" />
        </button>
        <button
          type="button"
          class="agent-conversation-panel__icon-btn"
          data-testid="agent-conversation-list-plus"
          @click="createDocumentConversation"
        >
          <Plus :size="16" />
        </button>
      </div>
    </header>

    <section
      v-if="isProjectDocumentPickerOpen"
      class="agent-conversation-panel__document-picker"
      data-testid="agent-conversation-document-picker"
    >
      <div class="agent-conversation-panel__document-picker-header">
        <strong>{{ t('shared.projectDocuments') }}</strong>
        <button
          type="button"
          class="agent-conversation-panel__document-picker-close"
          data-testid="agent-conversation-document-picker-close"
          @click="isProjectDocumentPickerOpen = false"
        >
          {{ t('shared.close') }}
        </button>
      </div>
      <p
        v-if="projectDocumentLoading"
        class="agent-conversation-panel__document-picker-message"
        data-testid="agent-conversation-document-picker-loading"
      >
        {{ t('shared.loadingProjectDocuments') }}
      </p>
      <p
        v-else-if="projectDocumentError"
        class="agent-conversation-panel__document-picker-message agent-conversation-panel__document-picker-message--error"
        data-testid="agent-conversation-document-picker-error"
      >
        {{ projectDocumentError }}
      </p>
      <p
        v-else-if="projectDocuments.length === 0"
        class="agent-conversation-panel__document-picker-message"
        data-testid="agent-conversation-document-picker-empty"
      >
        {{ t('shared.noProjectDocuments') }}
      </p>
      <div v-else class="agent-conversation-panel__document-picker-list">
        <button
          v-for="document in projectDocuments"
          :key="document.path"
          type="button"
          class="agent-conversation-panel__document-picker-item"
          :class="{ 'agent-conversation-panel__document-picker-item--active': document.path === currentPrimaryDocumentPath }"
          :data-testid="`agent-conversation-document-option-${document.name}`"
          @click="rebindConversationDocument(document.path)"
        >
          <span class="agent-conversation-panel__document-picker-name">{{ document.name }}</span>
          <span class="agent-conversation-panel__document-picker-path">{{ document.path }}</span>
        </button>
      </div>
    </section>

    <AgentDocumentConversationList
      v-if="panelMode === 'list' && hasConversationListContext"
      :conversations="listConversations"
      :active-conversation-id="chatStore.currentConversation?.id ?? null"
      :editing-conversation-id="editingConversationId"
      :show-document-label="isAgentDirectorySelection"
      :loading="isLoading"
      :error="currentError"
      :empty-message="listEmptyMessage"
      @open="openConversationDetail"
      @rename="submitRenameFromList"
      @cancel-rename="cancelRenameFromList"
      @delete="deleteConversationFromList"
    />
    <NormalChatView v-else class="agent-conversation-panel__detail" />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Archive, ArrowLeft, Files, PanelRightOpen, Pencil, Plus } from 'lucide-vue-next';
import type { ContextDocument, Conversation, IContextProvider, ProjectDocumentEntry, ResolvedAgentConfig } from '@plugins/ai-agent/src/internal';
import { toConversationQueryProvider } from '../providers/context/HttpConversationQueryProvider';
import AgentDocumentConversationList from './AgentDocumentConversationList.vue';
import NormalChatView from '../views/NormalChatView.vue';
import { useChatStore } from '../store/chat';
import type { ChatRoutePath } from '@packages/ui/src/routes';
import { useWorkspaceI18n } from '@packages/ui/src/i18n';
import { formatConversationTitle, extractNodeNameFromPath } from '../utils/conversationTitle';
import type { OpenConversationRequest } from '@packages/ui/src/types/conversationLink';

type PanelMode = 'list' | 'detail';

const props = defineProps<{
  activeAgent?: ResolvedAgentConfig | null;
  activeAgentKey?: string | null;
  activePath?: string | null;
  selectedNodePath?: string | null;
  activeDocument?: ContextDocument | null;
  showAgentConversationList?: boolean;
  contextProvider?: IContextProvider | null;
  openConversationRequest?: OpenConversationRequest | null;
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
const projectDocuments = ref<ProjectDocumentEntry[]>([]);
const projectDocumentLoading = ref(false);
const projectDocumentError = ref<string | null>(null);
const isProjectDocumentPickerOpen = ref(false);
const pendingRestoreConversationId = ref<string | null>(null);
const previousSelectionKey = ref<string | null>(null);
const editingConversationId = ref<string | null>(null);
let documentConversationLoadToken = 0;
let projectDocumentLoadToken = 0;

const activeDocumentPath = computed(() => props.activeDocument?.path?.trim() || '');
const isDocumentSelection = computed(() => !!activeDocumentPath.value);
const activeAgentKey = computed(() => props.activeAgentKey?.trim() || '');
const isAgentDirectorySelection = computed(() => !activeDocumentPath.value && !!activeAgentKey.value && props.showAgentConversationList === true);
const hasConversationListContext = computed(() => isDocumentSelection.value || isAgentDirectorySelection.value);
const currentConversationTitle = computed(() => {
  return formatConversationTitle(
    chatStore.currentConversation?.title,
    t('shared.newChat')
  );
});
const showToolbar = computed(() => hasConversationListContext.value);
const showBackButton = computed(() => panelMode.value === 'detail' && hasConversationListContext.value);
const toolbarTitle = computed(() => {
  if (!hasConversationListContext.value) {
    return '';
  }

  if (panelMode.value === 'detail') {
    return currentConversationTitle.value;
  }

  return '';
});
const hasCurrentConversation = computed(() => !!chatStore.currentConversation);
const documentScopedConversations = computed(() => {
  const scopedAgentKey = activeAgentKey.value;
  const activeDocId = props.activeDocument?.documentId;
  const mergedIds = new Set<string>();
  const merged: typeof documentConversations.value = [];

  const addIfNew = (conversation: (typeof merged)[number]) => {
    if (!mergedIds.has(conversation.id)) {
      mergedIds.add(conversation.id);
      merged.push(conversation);
    }
  };

  for (const conversation of documentConversations.value) {
    addIfNew(conversation);
  }

  // Include matching conversations from the local store so that
  // conversations created in the current session (not yet synced to the
  // server) are still visible after a page reload or document rename.
  if (activeDocId || activeDocumentPath.value) {
    for (const conversation of chatStore.conversations) {
      const matchesPath = conversation.documentPaths?.includes(activeDocumentPath.value);
      const matchesId = activeDocId && conversation.documentIds?.includes(activeDocId);
      if (matchesPath || matchesId) {
        addIfNew(conversation);
      }
    }
  }

  const currentConversation = chatStore.currentConversation;
  if (
    currentConversation
    && !mergedIds.has(currentConversation.id)
    && (currentConversation.documentPaths?.includes(activeDocumentPath.value)
      || (activeDocId && currentConversation.documentIds?.includes(activeDocId)))
    && (!scopedAgentKey || currentConversation.agentKey === scopedAgentKey)
  ) {
    merged.unshift(currentConversation);
  }

  return merged
    .filter((conversation) => {
      if (conversation.compare || conversation.sync?.deleted) {
        return false;
      }

      const matchesPath = conversation.documentPaths?.includes(activeDocumentPath.value);
      const matchesId = activeDocId && conversation.documentIds?.includes(activeDocId);
      if (!matchesPath && !matchesId) {
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
  const baseConversations = isDocumentSelection.value ? documentScopedConversations.value : agentScopedConversations.value;
  const activeConversation = chatStore.currentConversation;
  if (
    !hasConversationListContext.value
    || !activeConversation
    || activeConversation.compare
    || activeConversation.sync?.deleted
    || activeConversation.origin !== 'local'
    || baseConversations.some((conversation) => conversation.id === activeConversation.id)
  ) {
    return baseConversations;
  }

  // When the user manually returns from detail mode, keep the currently open
  // workspace conversation visible in the list even if its scoped linkage has
  // not been re-fetched from the backing provider yet.
  if (isDocumentSelection.value) {
    return [activeConversation, ...baseConversations];
  }

  const normalizedAgentKey = chatStore.resolveConversationAgentKey(activeAgentKey.value ?? null);
  const activeConversationAgentKey = chatStore.resolveConversationAgentKey(activeConversation.agentKey ?? null);
  if (normalizedAgentKey && normalizedAgentKey === activeConversationAgentKey) {
    return [activeConversation, ...baseConversations];
  }

  return baseConversations;
});
const listEmptyMessage = computed(() => {
  return isDocumentSelection.value ? t('shared.currentDocumentUnavailable') : t('shared.currentAgentUnavailable');
});

defineExpose({ listConversationCount: computed(() => listConversations.value.length) });
const currentProjectNodePath = computed(() => {
  return props.selectedNodePath?.trim()
    || props.activePath?.trim()
    || props.activeDocument?.path?.trim()
    || '/';
});
const currentPrimaryDocumentPath = computed(() => {
  return chatStore.currentConversation?.documentPaths?.[0] ?? null;
});
const canRebindConversationDocument = computed(() => {
  return !!props.contextProvider
    && !!chatStore.currentConversation
    && !!currentProjectNodePath.value;
});
const currentConversationArchiveState = computed(() => chatStore.currentConversationArchiveStatus.state);
const showRebindConversationAction = computed(() => hasCurrentConversation.value);
const showRenameConversationAction = computed(() => {
  return panelMode.value === 'list'
    && hasConversationListContext.value
    && chatStore.currentConversation?.origin === 'local';
});
const showArchiveConversationAction = computed(() => {
  return hasCurrentConversation.value
    && (
      chatStore.canArchiveCurrentConversation()
      || currentConversationArchiveState.value === 'archived'
      || currentConversationArchiveState.value === 'stale'
    );
});
const isArchiveConversationDisabled = computed(() => {
  return currentConversationArchiveState.value === 'archived'
    || chatStore.isArchivingConversation;
});
const isArchiveConversationHighlighted = computed(() => {
  return currentConversationArchiveState.value !== 'archived';
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
    const documentId = props.activeDocument?.documentId;
    const conversations = await toConversationQueryProvider(provider, import.meta.env).getConversations({ documentPath: path, documentId });
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

async function loadProjectDocuments(): Promise<void> {
  const provider = props.contextProvider;
  const curNode = currentProjectNodePath.value;
  const loadToken = ++projectDocumentLoadToken;
  if (!provider || !curNode) {
    projectDocuments.value = [];
    projectDocumentError.value = t('shared.noAgentBindingProvider');
    return;
  }

  projectDocumentLoading.value = true;
  projectDocumentError.value = null;
  try {
    const documents = await provider.getProjectDocuments(curNode);
    if (loadToken !== projectDocumentLoadToken) {
      return;
    }

    projectDocuments.value = documents;
  } catch (error) {
    if (loadToken !== projectDocumentLoadToken) {
      return;
    }

    projectDocuments.value = [];
    projectDocumentError.value = error instanceof Error ? error.message : t('shared.loadingProjectDocumentsFailed');
  } finally {
    if (loadToken === projectDocumentLoadToken) {
      projectDocumentLoading.value = false;
    }
  }
}

function openConversationList(): void {
  if (!hasConversationListContext.value) {
    panelMode.value = 'detail';
    return;
  }

  cancelRenameFromList();
  // A manual "back to list" should not immediately re-open the last detail
  // conversation via the restore pipeline for the same selection.
  pendingRestoreConversationId.value = null;
  panelMode.value = 'list';
  if (activeDocumentPath.value) {
    void loadDocumentConversations(activeDocumentPath.value);
  }
}

async function openConversationDetail(conversationId: string): Promise<void> {
  cancelRenameFromList();
  await chatStore.selectLocalConversation(conversationId);
  if (chatStore.currentConversation?.id !== conversationId) {
    const conversationSnapshot = listConversations.value.find((conversation) => conversation.id === conversationId);
    if (conversationSnapshot) {
      await chatStore.activateConversationSnapshot(conversationSnapshot);
    }
  }
  panelMode.value = 'detail';
}

async function openRequestedConversation(request: OpenConversationRequest): Promise<void> {
  cancelRenameFromList();
  const conversation = agentScopedConversations.value.find((candidate) => candidate.id === request.conversationId);
  if (!conversation) {
    return;
  }

  await chatStore.activateConversationSnapshot(conversation);
  if (chatStore.currentConversation?.id !== request.conversationId) {
    return;
  }

  panelMode.value = 'detail';
}

async function createDocumentConversation(): Promise<void> {
  await chatStore.startNewConversation({
    boundNodeName: extractNodeNameFromPath(props.selectedNodePath ?? props.activeDocument?.path ?? props.activePath ?? null),
    agentKey: props.activeAgentKey ?? null,
    documentPath: props.activeDocument?.path ?? props.activePath ?? null,
    activeDocument: props.activeDocument ?? null
  });
  panelMode.value = 'detail';
}

function startRenameCurrentConversation(): void {
  if (!chatStore.currentConversation || chatStore.currentConversation.origin !== 'local') {
    return;
  }
  editingConversationId.value = chatStore.currentConversation.id;
}

function cancelRenameFromList(): void {
  editingConversationId.value = null;
}

async function submitRenameFromList(payload: { id: string; title: string }): Promise<void> {
  await chatStore.renameLocalConversation(payload.id, payload.title);
  cancelRenameFromList();
}

async function deleteConversationFromList(conversationId: string): Promise<void> {
  const isCurrentConversation = chatStore.currentConversation?.id === conversationId;
  await chatStore.deleteLocalConversation(conversationId);
  if (isCurrentConversation && activeDocumentPath.value) {
    await chatStore.startNewConversation({
      boundNodeName: extractNodeNameFromPath(props.selectedNodePath ?? props.activeDocument?.path ?? props.activePath ?? null),
      agentKey: props.activeAgentKey ?? null,
      documentPath: props.activeDocument?.path ?? props.activePath ?? null,
      activeDocument: props.activeDocument ?? null
    });
  }
  if (activeDocumentPath.value) {
    void loadDocumentConversations(activeDocumentPath.value);
  }
}

async function toggleProjectDocumentPicker(): Promise<void> {
  if (!canRebindConversationDocument.value) {
    return;
  }

  isProjectDocumentPickerOpen.value = !isProjectDocumentPickerOpen.value;
  if (isProjectDocumentPickerOpen.value) {
    await loadProjectDocuments();
  }
}

async function rebindConversationDocument(documentPath: string): Promise<void> {
  const conversationId = chatStore.currentConversation?.id;
  if (!conversationId) {
    return;
  }

  await chatStore.bindConversationToDocument(conversationId, {
    documentPath,
    previousDocumentPath: currentPrimaryDocumentPath.value
  });
  isProjectDocumentPickerOpen.value = false;

  if (activeDocumentPath.value) {
    void loadDocumentConversations(activeDocumentPath.value);
  }
}

async function archiveConversationFromToolbar(): Promise<void> {
  if (isArchiveConversationDisabled.value) {
    return;
  }

  await chatStore.archiveCurrentConversationToDocument();
}

function switchWorkspace(path: ChatRoutePath): void {
  emit('request-workspace-switch', path);
}

function consumeRestoreConversationId(): void {
  pendingRestoreConversationId.value = null;
}

function resolveRestoreConversationIdForSelection(): string | null {
  const savedStatus = chatStore.restoreAgentViewStatus();
  if (!savedStatus?.activeConversationId) {
    return null;
  }

  const matchesSavedSelection = savedStatus.activePath
    ? activeDocumentPath.value === savedStatus.activePath
    : (props.selectedNodePath ?? null) === savedStatus.selectedNodePath;

  return matchesSavedSelection ? savedStatus.activeConversationId : null;
}

function buildSelectionKey(): string | null {
  if (activeDocumentPath.value) {
    return `document:${activeDocumentPath.value}`;
  }

  if (hasConversationListContext.value) {
    return `node:${props.selectedNodePath ?? props.activePath ?? activeAgentKey.value}`;
  }

  return null;
}

function syncPanelStateFromSelection(): void {
  const selectionKey = buildSelectionKey();
  const selectionChanged = previousSelectionKey.value !== selectionKey;
  previousSelectionKey.value = selectionKey;

  if (hasConversationListContext.value) {
    cancelRenameFromList();
    if (selectionChanged) {
      pendingRestoreConversationId.value = resolveRestoreConversationIdForSelection();
    }

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
  cancelRenameFromList();
  documentConversations.value = [];
  currentError.value = null;
  documentConversationLoadToken += 1;
  isProjectDocumentPickerOpen.value = false;
}

watch(
  () => props.activeAgent ?? null,
  (agent) => {
    chatStore.setActiveAgentContext(agent);
    void chatStore.applyActiveAgentContextSelection(agent);
  },
  { immediate: true, flush: 'sync' }
);

onBeforeUnmount(() => {
  chatStore.setActiveAgentContext(null);
});

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
    projectDocuments.value = [];
    projectDocumentError.value = null;
    projectDocumentLoadToken += 1;
    isProjectDocumentPickerOpen.value = false;
  },
  { immediate: true, flush: 'sync' }
);

watch(
  () => props.openConversationRequest ?? null,
  (request) => {
    if (!request) {
      return;
    }

    void openRequestedConversation(request);
  }
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

// When documentId becomes available (async readDocument completing after initial render),
// reload conversations so ID-based lookup can find conversations linked via stable document ID.
watch(
  () => props.activeDocument?.documentId ?? null,
  (documentId, prevDocumentId) => {
    if (documentId && documentId !== prevDocumentId && panelMode.value === 'list' && activeDocumentPath.value) {
      void loadDocumentConversations(activeDocumentPath.value);
    }
  }
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
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(8, 15, 26, 0.9);
}

.agent-conversation-panel__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  color: rgba(226, 232, 240, 0.86);
  background: transparent;
  cursor: pointer;
}

.agent-conversation-panel__title-wrap {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
}

.agent-conversation-panel__tools {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.agent-conversation-panel__icon-btn:hover,
.agent-conversation-panel__icon-btn:focus-visible {
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
}

.agent-conversation-panel__icon-btn:disabled {
  cursor: default;
  opacity: 0.42;
}

.agent-conversation-panel__icon-btn--highlighted {
  background: rgba(59, 130, 246, 0.24);
  color: #dbeafe;
}

.agent-conversation-panel__icon-btn--hidden {
  visibility: hidden;
  pointer-events: none;
}

.agent-conversation-panel__title {
  margin: 0;
  color: #f8fafc;
  font-size: 14px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}


.agent-conversation-panel__detail {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.agent-conversation-panel__document-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(8, 15, 26, 0.96);
}

.agent-conversation-panel__document-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #e2e8f0;
  font-size: 13px;
}

.agent-conversation-panel__document-picker-close {
  border: 0;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
}

.agent-conversation-panel__document-picker-message {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
}

.agent-conversation-panel__document-picker-message--error {
  color: #fecaca;
}

.agent-conversation-panel__document-picker-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow: auto;
}

.agent-conversation-panel__document-picker-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.56);
  color: #e2e8f0;
  text-align: left;
  cursor: pointer;
}

.agent-conversation-panel__document-picker-item:hover,
.agent-conversation-panel__document-picker-item:focus-visible,
.agent-conversation-panel__document-picker-item--active {
  border-color: rgba(56, 189, 248, 0.5);
  background: rgba(14, 165, 233, 0.12);
}

.agent-conversation-panel__document-picker-name {
  font-size: 13px;
  font-weight: 600;
}

.agent-conversation-panel__document-picker-path {
  color: #94a3b8;
  font-size: 12px;
}
</style>
