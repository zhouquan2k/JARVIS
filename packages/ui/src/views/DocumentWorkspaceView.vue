<template>
  <section class="knowledge-shell" data-testid="document-workspace">
    <div
      ref="shellRef"
      class="knowledge-grid"
      :style="{ gridTemplateColumns }"
    >
      <div class="grid-pane">
        <DocumentFileTree
          :nodes="documentStore.nodes"
          :expanded-paths="documentStore.expandedPaths"
          :active-path="documentStore.selectedNodePath"
          :current-error="documentStore.currentError"
          @open="onOpenNode"
          @toggle-expand="documentStore.toggleExpanded"
          @create="documentStore.createNode"
          @delete="documentStore.deleteNode"
          @rename="documentStore.renameNode"
          @refresh="documentStore.refreshTree"
        />
      </div>
      <div
        class="resize-handle"
        data-testid="document-resize-left"
        @pointerdown="startResize(0, $event)"
      />
      <div class="grid-pane">
        <section class="middle-pane" data-testid="middle-pane">
          <div
            ref="viewportRef"
            class="middle-pane__viewport"
            data-testid="middle-pane-viewport"
            @wheel="handleMiddlePaneWheel"
          >
            <AgentView
              v-if="selectedOwnerNode && documentStore.activeAgent && documentStore.activeAgentKey && !documentStore.activePath"
              :agent-key="documentStore.activeAgentKey"
              :agent="documentStore.activeAgent"
              :owner-node="selectedOwnerNode"
              :index-path="documentStore.agentIndexPath"
              :index-document="documentStore.agentIndexDocument"
              :index-draft-content="documentStore.agentIndexDraftContent"
              :index-viewer-id="documentStore.agentIndexViewerId"
              :index-pane-mode="documentStore.agentIndexPaneMode"
              :index-is-saving="documentStore.agentIndexIsSaving"
              :index-is-dirty="!!(documentStore.agentIndexPath && documentStore.dirtyPaths[documentStore.agentIndexPath])"
              :providers="chatStore.availableProviders"
              :builtin-tools="builtinTools"
              :model-load-states="chatStore.providerModelStates"
              :linkable-markdown-documents="agentIndexLinkableMarkdownDocuments"
              @load-provider-models="chatStore.ensureProviderModelsLoaded"
              @save-agent-config="saveSelectedAgentConfig"
              @update-index-content="documentStore.updateAgentIndexDocument"
              @save-index-document="documentStore.flushAgentIndexDocument"
              @open-document-link="onOpenDocumentLink"
            />
            <DocumentEditorPane
              v-else
              :active-path="documentStore.activePath"
              :active-agent-name="documentStore.activeAgent?.name ?? null"
              :active-document="documentStore.activeDocument"
              :active-viewer-id="documentStore.activeViewerId"
              :active-pane-mode="documentStore.activePaneMode"
              :model-value="draftContent"
              :linkable-markdown-documents="activeLinkableMarkdownDocuments"
              :is-saving="documentStore.isSaving"
              :is-dirty="activeDocumentIsDirty"
              :persist-markdown-image="documentStore.persistPastedMarkdownImage"
              :middle-pane-mode="documentStore.middlePaneMode"
              :middle-pane-zoom="documentStore.middlePaneZoom"
              :latest-file-change="documentStore.latestFileChange"
              :diff-entries="documentStore.activeDiffEntries"
              :can-undo="documentStore.canUndoActiveFile"
              :can-redo="documentStore.canRedoActiveFile"
              @update:model-value="onDraftChange"
              @save="documentStore.flushActiveDocument"
              @toggle-middle-pane-mode="documentStore.toggleMiddlePaneExpanded()"
              @undo-change="documentStore.undoActiveFileChange"
              @redo-change="documentStore.redoActiveFileChange"
              @open-document-link="onOpenDocumentLink"
            />
          </div>
        </section>
      </div>
      <div
        class="resize-handle"
        :class="{ 'resize-handle--hidden': documentStore.middlePaneMode === 'maximized' }"
        data-testid="document-resize-right"
        @pointerdown="startResize(1, $event)"
      />
      <div
        class="grid-pane"
        :class="{ 'grid-pane--collapsed': documentStore.middlePaneMode === 'maximized' }"
      >
        <slot name="assistant-pane">
        <AgentPane
          @request-workspace-switch="requestWorkspaceSwitch"
          :active-agent="documentStore.activeAgent"
          :active-agent-key="documentStore.activeAgentKey"
          :active-path="documentStore.activePath"
            :selected-node-path="documentStore.selectedNodePath"
            :active-document="activeAssistantDocument"
            :show-agent-conversation-list="!!documentStore.activeAgent && !!documentStore.activeAgentKey && !documentStore.activePath"
            :context-provider="props.contextProvider"
            :on-file-changed="handleAssistantFileChanged"
            :agent-resolution-error="documentStore.agentResolutionError"
            :restore-conversation-id="restoredAgentConversationId"
          />
        </slot>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  DEFAULT_WORKSPACE_AGENT_KEY,
  createBuiltinWorkspaceToolDefinitions,
  encodeTextDocument,
  type AgentInheritanceMode,
  type ContextNode,
  type IContextProvider
} from '@packages/core/src';
import AgentView from '../components/AgentView.vue';
import AgentPane from '../components/AgentPane.vue';
import DocumentEditorPane from '../components/DocumentEditorPane.vue';
import DocumentFileTree from '../components/DocumentFileTree.vue';
import { useChatStore } from '../store/chat';
import { useDocumentWorkspaceStore } from '../store/documentWorkspace';
import type { ChatRoutePath } from '../routes';

const props = withDefaults(defineProps<{
  contextProvider: IContextProvider;
  panelSizes?: [number, number, number];
}>(), {
  panelSizes: () => [20, 50, 30]
});

const documentStore = useDocumentWorkspaceStore();
const chatStore = useChatStore();
const builtinTools = createBuiltinWorkspaceToolDefinitions();
const emit = defineEmits<{
  (event: 'request-workspace-switch', path: ChatRoutePath): void;
}>();
const shellRef = ref<HTMLElement | null>(null);
const viewportRef = ref<HTMLElement | null>(null);
const panelSizes = computed(() => documentStore.panelSizes);
const draftContent = computed(() => documentStore.draftContent);
const gridTemplateColumns = computed(() => {
  if (documentStore.middlePaneMode === 'maximized') {
    return `minmax(0, calc((100% - 4px) * ${panelSizes.value[0]} / 100)) 4px minmax(0, calc((100% - 4px) * ${100 - panelSizes.value[0]} / 100)) 0px minmax(0, 0px)`;
  }

  return `minmax(0, calc((100% - 8px) * ${panelSizes.value[0]} / 100)) 4px minmax(0, calc((100% - 8px) * ${panelSizes.value[1]} / 100)) 4px minmax(0, calc((100% - 8px) * ${panelSizes.value[2]} / 100))`;
});
const activeDocumentIsDirty = computed(() => {
  return !!documentStore.activePath && documentStore.dirtyPaths[documentStore.activePath] === true;
});
const activeLinkableMarkdownDocuments = computed(() => {
  return documentStore.getLinkableMarkdownDocuments(documentStore.activePath);
});
const agentIndexLinkableMarkdownDocuments = computed(() => {
  return documentStore.getLinkableMarkdownDocuments(documentStore.agentIndexPath);
});
const isWorkspaceSelectionReady = ref(false);
const selectedOwnerNode = computed<ContextNode | null>(() => {
  if (documentStore.selectedNodePath === '/' && documentStore.activeAgent) {
    return {
      path: '/',
      name: 'Root',
      kind: 'directory',
      agentKey: documentStore.activeAgentKey ?? DEFAULT_WORKSPACE_AGENT_KEY,
      isAgentOwner: true
    };
  }

  const activeNode = documentStore.activeNode;
  return activeNode?.kind === 'directory' && activeNode.isAgentOwner ? activeNode : null;
});
const restoredAgentConversationId = computed(() => {
  const savedAgentViewStatus = chatStore.restoreAgentViewStatus();
  if (!savedAgentViewStatus?.activeConversationId) {
    return null;
  }

  const matchesSavedSelection = savedAgentViewStatus.activePath
    ? documentStore.activePath === savedAgentViewStatus.activePath
    : documentStore.selectedNodePath === savedAgentViewStatus.selectedNodePath;

  return matchesSavedSelection ? savedAgentViewStatus.activeConversationId : null;
});
const activeAssistantDocument = computed(() => {
  if (!documentStore.activeDocument) {
    return null;
  }

  if (!documentStore.activeViewerCapabilities?.edit) {
    return documentStore.activeDocument;
  }

  return {
    ...documentStore.activeDocument,
    dataBase64: encodeTextDocument(documentStore.draftContent)
  };
});

function requestWorkspaceSwitch(path: ChatRoutePath): void {
  if (path === '/chat' && documentStore.activeAgent) {
    chatStore.saveWorkspaceAgentContext(documentStore.activeAgent);
  }

  emit('request-workspace-switch', path);
}

async function syncWorkspaceConversationSelection(): Promise<void> {
  if (!isWorkspaceSelectionReady.value) {
    return;
  }

  const savedAgentViewStatus = chatStore.restoreAgentViewStatus();
  const isSameSelection = savedAgentViewStatus
    && (
      savedAgentViewStatus.activePath
        ? documentStore.activePath === savedAgentViewStatus.activePath
        : documentStore.selectedNodePath === savedAgentViewStatus.selectedNodePath
    );

  if (isSameSelection) {
    if (!savedAgentViewStatus.activeConversationId) {
      if (chatStore.currentConversation) {
        chatStore.clearWorkspaceConversationSelection();
      }
      return;
    }

    if (chatStore.currentConversation?.id !== savedAgentViewStatus.activeConversationId) {
      try {
        await chatStore.selectLocalConversation(savedAgentViewStatus.activeConversationId);
      } catch {
        chatStore.clearWorkspaceConversationSelection();
      }
    }
    return;
  }

  if (chatStore.currentConversation) {
    chatStore.clearWorkspaceConversationSelection();
  }
}

async function onOpenNode(path: string) {
  await documentStore.openNode(path);
  documentStore.setMiddlePaneMode('default');
  documentStore.resetMiddlePaneZoom();
  await syncWorkspaceConversationSelection();
}

async function onOpenDocumentLink(path: string): Promise<void> {
  await documentStore.openNode(path);
  documentStore.setMiddlePaneMode('default');
  documentStore.resetMiddlePaneZoom();
  await syncWorkspaceConversationSelection();
}

async function saveSelectedAgentConfig(patch: {
  description?: string;
  instructions?: string;
  modelProviderName?: string;
  modelName?: string;
  inheritance?: AgentInheritanceMode;
  tools?: Array<{ id: string; description?: string }>;
  inheritTools?: boolean;
}): Promise<void> {
  if (!selectedOwnerNode.value) {
    return;
  }

  await documentStore.saveAgentConfig({
    ownerPath: selectedOwnerNode.value.path,
    patch
  });
}

watch(() => props.panelSizes, (value) => {
  documentStore.setPanelSizes(value);
}, { immediate: true });

watch(() => props.contextProvider, async (provider) => {
  isWorkspaceSelectionReady.value = false;
  documentStore.setContextProvider(provider);
  await documentStore.hydrateWorkspace();

  const savedAgentViewStatus = chatStore.restoreAgentViewStatus();
  if (!savedAgentViewStatus) {
    isWorkspaceSelectionReady.value = true;
    return;
  }

  if (
    savedAgentViewStatus.activeConversationId
    && chatStore.currentConversation?.id !== savedAgentViewStatus.activeConversationId
  ) {
    await chatStore.selectLocalConversation(savedAgentViewStatus.activeConversationId).catch(() => undefined);
  } else {
    if (chatStore.isPreviewing) {
      chatStore.exitPreview();
    }

    if (chatStore.historySource !== 'local') {
      await chatStore.setHistorySource('local');
    }
  }

  await documentStore.restoreSelection({
    selectedNodePath: savedAgentViewStatus.selectedNodePath,
    activePath: savedAgentViewStatus.activePath
  });
  isWorkspaceSelectionReady.value = true;
  await syncWorkspaceConversationSelection();
}, { immediate: true });

watch(
  () => [documentStore.selectedNodePath, documentStore.activePath] as const,
  () => {
    void syncWorkspaceConversationSelection();
  },
  { immediate: true, flush: 'sync' }
);

watch(
  () => [documentStore.activeAgentKey, documentStore.activePath, activeAssistantDocument.value, props.contextProvider] as const,
  ([activeAgentKey, activePath, activeDocument, contextProvider]) => {
    chatStore.setWorkspaceContext({
      activeAgentKey,
      selectedNodePath: documentStore.selectedNodePath,
      activePath,
      activeDocument,
      contextProvider,
      onFileChanged: handleAssistantFileChanged
    });
  },
  { immediate: true, flush: 'sync' }
);

let cleanupResize: (() => void) | null = null;

function onDraftChange(markdown: string) {
  documentStore.updateActiveDocument(markdown);
}

function handleAssistantFileChanged(change: { path: string; beforeContent: string; afterContent: string; alreadyPersisted?: boolean }) {
  if (change.alreadyPersisted) {
    documentStore.recordFileChange(change);
    return;
  }

  return documentStore.applyGeneratedDocumentChange(change);
}

function handleMiddlePaneWheel(event: WheelEvent) {
  if (!event.ctrlKey) {
    return;
  }

  event.preventDefault();
  documentStore.stepMiddlePaneZoom(event.deltaY < 0 ? 1 : -1);
}

function getMiddlePaneZoomScrollTarget(): HTMLElement | null {
  const viewport = viewportRef.value;
  if (!viewport) {
    return null;
  }

  return (
    viewport.querySelector<HTMLElement>('[data-testid="document-editor-scroll-shell"]') ??
    viewport.querySelector<HTMLElement>('[data-testid="document-editor-surface"]') ??
    viewport.querySelector<HTMLElement>('[data-testid="document-editor-input"]')
  );
}

function applyCenteredZoom(previousZoom: number, nextZoom: number) {
  const scrollTarget = getMiddlePaneZoomScrollTarget();
  if (!scrollTarget || previousZoom <= 0 || nextZoom <= 0) {
    return;
  }

  const ratio = nextZoom / previousZoom;
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio === 1) {
    return;
  }

  const nextScrollLeft = (scrollTarget.scrollLeft + scrollTarget.clientWidth / 2) * ratio - scrollTarget.clientWidth / 2;
  const nextScrollTop = (scrollTarget.scrollTop + scrollTarget.clientHeight / 2) * ratio - scrollTarget.clientHeight / 2;
  scrollTarget.scrollLeft = Math.max(0, nextScrollLeft);
  scrollTarget.scrollTop = Math.max(0, nextScrollTop);
}

watch(
  () => documentStore.activePath,
  (value, previous) => {
    if (value && previous && value !== previous) {
      documentStore.setMiddlePaneMode('default');
      documentStore.resetMiddlePaneZoom();
    }
  }
);

watch(
  () => documentStore.middlePaneZoom,
  async (nextZoom, previousZoom) => {
    const priorZoom = typeof previousZoom === 'number' ? previousZoom : 1;
    if (nextZoom === priorZoom) {
      return;
    }

    await nextTick();
    applyCenteredZoom(priorZoom, nextZoom);
  },
  { immediate: true }
);

function startResize(handleIndex: 0 | 1, event: PointerEvent) {
  const shell = shellRef.value;
  if (!shell) {
    return;
  }

  event.preventDefault();
  const startX = event.clientX;
  const startSizes = [...documentStore.panelSizes] as [number, number, number];
  const shellWidth = shell.getBoundingClientRect().width;

  const onMove = (moveEvent: PointerEvent) => {
    const deltaPercent = ((moveEvent.clientX - startX) / shellWidth) * 100;
    const nextSizes = [...startSizes] as [number, number, number];

    if (handleIndex === 0) {
      nextSizes[0] = startSizes[0] + deltaPercent;
      nextSizes[1] = startSizes[1] - deltaPercent;
    } else {
      nextSizes[1] = startSizes[1] + deltaPercent;
      nextSizes[2] = startSizes[2] - deltaPercent;
    }

    documentStore.setPanelSizes(nextSizes);
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    cleanupResize = null;
  };

  cleanupResize?.();
  cleanupResize = onUp;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

onBeforeUnmount(() => {
  cleanupResize?.();
});
</script>

<style scoped>
.knowledge-shell {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(14, 165, 233, 0.12), transparent 24%),
    radial-gradient(circle at bottom right, rgba(56, 189, 248, 0.1), transparent 20%),
    linear-gradient(180deg, #060b12, #0b1220);
}

.knowledge-grid {
  display: grid;
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  height: 100%;
  overflow: hidden;
}

.grid-pane {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.middle-pane {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.middle-pane__viewport {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

.resize-handle {
  cursor: col-resize;
  background: linear-gradient(180deg, rgba(37, 99, 235, 0.28), rgba(14, 165, 233, 0.18));
}

.resize-handle:hover {
  background: linear-gradient(180deg, rgba(37, 99, 235, 0.5), rgba(14, 165, 233, 0.4));
}

.resize-handle--hidden {
  opacity: 0;
  pointer-events: none;
}

.grid-pane--collapsed {
  visibility: hidden;
  pointer-events: none;
}
</style>
