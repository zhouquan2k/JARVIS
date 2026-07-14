<template>
  <section class="knowledge-shell" data-testid="document-workspace">
    <div
      ref="shellRef"
      class="knowledge-grid"
      :class="{ 'knowledge-grid--narrow': isNarrowViewport }"
      :style="{ gridTemplateColumns }"
    >
      <div
        class="grid-pane grid-pane--tree"
        :class="{ 'grid-pane--tree-open': treeDrawerOpen, 'grid-pane--collapsed': documentStore.conversationFocusMode }"
      >
        <DocumentFileTree
          :nodes="documentStore.nodes"
          :recent-nodes="documentStore.recentNodes"
          :expanded-paths="documentStore.expandedPaths"
          :active-path="documentStore.selectedNodePath"
          :current-error="documentStore.currentError"
          @open="onOpenNode"
          @toggle-expand="documentStore.toggleExpanded"
          @create="documentStore.createNode"
          @enable-directory-metadata="documentStore.enableDirectoryMetadata"
          @delete="documentStore.deleteNode"
          @rename="documentStore.renameNode"
          @move="onMoveNode"
          @refresh="documentStore.refreshTree"
          @import="openImportWizard"
        />
        <MoveConfirmDialog
          v-if="showMoveConfirm && pendingMoveInput"
          :node-name="pendingNodeName"
          :destination-path="pendingDestPath"
          :has-outgoing-links="pendingHasLinks"
          @confirm="onMoveConfirm"
          @cancel="onMoveCancel"
        />
        <MoveErrorDialog
          v-if="showMoveError"
          :reason="moveErrorReason"
          @dismiss="showMoveError = false"
        />
        <ImportWizardDialog
          v-if="showImportWizard"
          :sources="documentImportSources"
          :language-models="availableLanguageModels"
          :directories="availableImportDirectories"
          :initial-target-parent-path="importWizardTargetParentPath"
          :run-import="runDocumentImport"
          @close="showImportWizard = false"
        />
      </div>
      <div
        class="resize-handle"
        :class="{ 'resize-handle--hidden': documentStore.conversationFocusMode }"
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
            <component
              :is="activeWorkspaceSelectionComponent"
              v-if="activeWorkspaceSelectionComponent"
              v-bind="workspaceSelectionInput"
              @open-document-link="onOpenDocumentLink"
              @open-conversation-link="onOpenConversationLink"
            />
            <DocumentEditorPane
              v-else
              :active-path="displayedDocumentPath"
              :active-document="displayedDocument"
              :active-viewer-id="displayedViewerId"
              :active-pane-mode="displayedPaneMode"
              :hide-toolbar="documentStore.conversationFocusMode"
              :active-scope-label="activeScopeLabel"
              :model-value="displayedDraftContent"
              :linkable-markdown-documents="activeLinkableMarkdownDocuments"
              :linkable-reference-resources="activeLinkableReferenceResources"
              :insert-link-types="activeInsertLinkTypes"
              :is-saving="displayedIsSaving"
              :is-dirty="displayedDocumentIsDirty"
              :persist-markdown-image="documentStore.persistPastedMarkdownImage"
              :upload-markdown-link-resource="documentStore.uploadMarkdownLinkResource"
              :middle-pane-mode="documentStore.middlePaneMode"
              :middle-pane-zoom="documentStore.middlePaneZoom"
              :latest-file-change="documentStore.latestFileChange"
              :diff-entries="documentStore.activeDiffEntries"
              :can-undo="documentStore.canUndoActiveFile"
              :can-redo="documentStore.canRedoActiveFile"
              @update:model-value="onDraftChange"
              @save="onSaveDisplayedDocument"
              @refresh-document="onRefreshDisplayedDocument"
              @toggle-middle-pane-mode="documentStore.toggleMiddlePaneExpanded()"
              @undo-change="documentStore.undoActiveFileChange"
              @redo-change="documentStore.redoActiveFileChange"
              @open-document-link="onOpenDocumentLink"
              @open-conversation-link="onOpenConversationLink"
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
        class="grid-pane grid-pane--assistant"
        :class="{
          'grid-pane--collapsed': documentStore.middlePaneMode === 'maximized',
          'grid-pane--assistant-open': assistantDrawerOpen
        }"
      >
        <slot name="assistant-pane">
        <WorkspaceRightPane
          @request-workspace-switch="requestWorkspaceSwitch"
          :active-scope-data="documentStore.activeScopeData"
          :active-scope-key="documentStore.activeScopeKey"
          :active-path="documentStore.activePath"
            :selected-node-path="documentStore.selectedNodePath"
            :active-document="activeAssistantDocument"
            :show-scope-conversation-list="!!documentStore.activeScopeData && !!documentStore.activeScopeKey && !documentStore.activePath"
            :context-provider="props.contextProvider"
            :on-file-changed="handleAssistantFileChanged"
            :open-conversation-request="openConversationRequest"
          />
        </slot>
      </div>
    </div>
    <div
      v-if="isNarrowViewport && treeDrawerOpen"
      class="tree-drawer-backdrop"
      data-testid="tree-drawer-backdrop"
      @click="treeDrawerOpen = false"
    />
    <button
      v-if="isNarrowViewport"
      type="button"
      class="tree-drawer-toggle"
      data-testid="tree-drawer-toggle"
      :aria-label="treeDrawerOpen ? t('shared.closeFileTree') : t('shared.openFileTree')"
      @click="toggleTreeDrawer"
    >
      <PanelLeft :size="20" />
    </button>
    <div
      v-if="isNarrowViewport && assistantDrawerOpen"
      class="assistant-drawer-backdrop"
      data-testid="assistant-drawer-backdrop"
      @click="assistantDrawerOpen = false"
    />
    <button
      v-if="isNarrowViewport && documentStore.middlePaneMode !== 'maximized'"
      type="button"
      class="assistant-drawer-toggle"
      data-testid="assistant-drawer-toggle"
      :aria-label="assistantDrawerOpen ? t('shared.closeAssistant') : t('shared.openAssistant')"
      @click="toggleAssistantDrawer"
    >
      <PanelRight :size="20" />
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  DEFAULT_WORKSPACE_SCOPE_KEY as DEFAULT_WORKSPACE_SCOPE_KEY,
  decodeTextDocument,
  encodeTextDocument,
  isTextDocumentMimeType,
  type ContextNode,
  type IContextProvider
} from '@packages/core/src';
import { PanelLeft, PanelRight } from 'lucide-vue-next';
import WorkspaceRightPane from '../components/WorkspaceRightPane.vue';
import DocumentEditorPane from '../components/DocumentEditorPane.vue';
import DocumentFileTree from '../components/DocumentFileTree.vue';
import ImportWizardDialog from '../components/ImportWizardDialog.vue';
import MoveConfirmDialog from '../components/MoveConfirmDialog.vue';
import MoveErrorDialog from '../components/MoveErrorDialog.vue';
import { useWorkspaceI18n } from '../i18n';
import { contributionQueryKey, workspaceRuntimeContextKey } from '../plugins/injectionKeys';
import { useIsNarrowViewport } from '../composables/useIsNarrowViewport';
import { useDocumentImports } from '../services/documentCreationFlows';
import { useDocumentWorkspaceStore } from '../store/documentWorkspace';
import type { ChatRoutePath } from '../routes';
import { rewriteOutgoingLinks, type MarkdownConversationLinkTarget } from '../utils/markdownDocument';
import type { OpenConversationRequest } from '../types/conversationLink';
import type { ResolvedInsertLinkType } from '../types/insertLink';

const props = withDefaults(defineProps<{
  contextProvider: IContextProvider;
  panelSizes?: [number, number, number];
}>(), {
  panelSizes: () => [20, 50, 30]
});

const documentStore = useDocumentWorkspaceStore();
const { t } = useWorkspaceI18n();
const contributionQuery = inject(contributionQueryKey, null);
const runtimeContext = inject(workspaceRuntimeContextKey, null);
const documentImportSources = useDocumentImports();
const emit = defineEmits<{
  (event: 'request-workspace-switch', path: ChatRoutePath): void;
}>();
const shellRef = ref<HTMLElement | null>(null);
const viewportRef = ref<HTMLElement | null>(null);
const isNarrowViewport = useIsNarrowViewport();
const treeDrawerOpen = ref(false);
const assistantDrawerOpen = ref(false);
const panelSizes = computed(() => documentStore.panelSizes);
const conversationFocusPanelSizes = computed(() => documentStore.conversationFocusPanelSizes);
const gridTemplateColumns = computed(() => {
  if (isNarrowViewport.value) {
    return 'minmax(0, 1fr)';
  }

  if (documentStore.conversationFocusMode) {
    return `0px 0px minmax(0, calc((100% - 4px) * ${conversationFocusPanelSizes.value[0]} / 100)) 4px minmax(0, calc((100% - 4px) * ${conversationFocusPanelSizes.value[1]} / 100))`;
  }

  if (documentStore.middlePaneMode === 'maximized') {
    return `minmax(0, calc((100% - 4px) * ${panelSizes.value[0]} / 100)) 4px minmax(0, calc((100% - 4px) * ${100 - panelSizes.value[0]} / 100)) 0px minmax(0, 0px)`;
  }

  return `minmax(0, calc((100% - 8px) * ${panelSizes.value[0]} / 100)) 4px minmax(0, calc((100% - 8px) * ${panelSizes.value[1]} / 100)) 4px minmax(0, calc((100% - 8px) * ${panelSizes.value[2]} / 100))`;
});
const activeDocumentIsDirty = computed(() => {
  return !!documentStore.activePath && documentStore.dirtyPaths[documentStore.activePath] === true;
});
const fallbackIndexDocumentIsActive = computed(() => {
  return !activeWorkspaceSelectionComponent.value
    && !documentStore.activePath
    && !!documentStore.scopeIndexDocument;
});
const displayedDocumentPath = computed(() => {
  return documentStore.activePath ?? (fallbackIndexDocumentIsActive.value ? documentStore.scopeIndexPath : null);
});
const displayedDocument = computed(() => {
  return documentStore.activeDocument ?? (fallbackIndexDocumentIsActive.value ? documentStore.scopeIndexDocument : null);
});
const displayedViewerId = computed(() => {
  return documentStore.activeViewerId ?? (fallbackIndexDocumentIsActive.value ? documentStore.scopeIndexViewerId : null);
});
const displayedPaneMode = computed(() => {
  return documentStore.activePath
    ? documentStore.activePaneMode
    : (fallbackIndexDocumentIsActive.value ? documentStore.scopeIndexPaneMode : documentStore.activePaneMode);
});
const displayedDraftContent = computed(() => {
  return documentStore.activePath
    ? documentStore.draftContent
    : (fallbackIndexDocumentIsActive.value ? documentStore.scopeIndexDraftContent : documentStore.draftContent);
});
const displayedIsSaving = computed(() => {
  return documentStore.activePath
    ? documentStore.isSaving
    : (fallbackIndexDocumentIsActive.value ? documentStore.scopeIndexIsSaving : documentStore.isSaving);
});
const displayedDocumentIsDirty = computed(() => {
  const path = displayedDocumentPath.value;
  return !!path && documentStore.dirtyPaths[path] === true;
});
const activeScopeLabel = computed(() => {
  const name = documentStore.activeScopeData?.name;
  return typeof name === 'string' ? name : null;
});
const activeLinkableMarkdownDocuments = computed(() => {
  return documentStore.getLinkableMarkdownDocuments(displayedDocumentPath.value);
});
const activeLinkableReferenceResources = computed(() => {
  return documentStore.getLinkableReferenceResources(displayedDocumentPath.value);
});
const activeInsertLinkTypes = ref<ResolvedInsertLinkType[]>([]);
const isWorkspaceSelectionReady = ref(false);
const hasRestoredPersistedSelection = ref(false);
const openConversationRequest = ref<OpenConversationRequest | null>(null);
const showMoveConfirm = ref(false);
const showMoveError = ref(false);
const moveErrorReason = ref<'cross-scope' | 'references-dir'>('cross-scope');
const pendingMoveInput = ref<{ path: string; targetParentPath?: string } | null>(null);
const pendingNodeName = ref('');
const pendingDestPath = ref('');
const pendingHasLinks = ref(false);
const showImportWizard = ref(false);
const importWizardTargetParentPath = ref('/');
const selectedOwnerNode = computed<ContextNode | null>(() => {
  if (documentStore.selectedNodePath === '/' && documentStore.activeScopeKey) {
    return {
      path: '/',
      name: 'Root',
      kind: 'directory',
      scopeKey: documentStore.activeScopeKey,
      ownsMetadata: true
    };
  }

  const activeNode = documentStore.activeNode;
  return activeNode?.kind === 'directory' && activeNode.ownsMetadata ? activeNode : null;
});
const workspaceSelectionInput = computed(() => ({
  selectedNode: documentStore.activeNode,
  selectedOwnerNode: selectedOwnerNode.value,
  activePath: documentStore.activePath,
  activeScopeKey: documentStore.activeScopeKey,
  activeScopeMetadata: documentStore.activeScopeMetadata,
  contextProvider: props.contextProvider
}));
const activeWorkspaceSelectionComponent = computed(() => {
  const views = contributionQuery?.value?.getWorkspaceSelectionViews() ?? [];
  return views.find((view) => view.matches(workspaceSelectionInput.value))?.component ?? null;
});
const availableLanguageModels = computed(() => {
  return contributionQuery?.value?.getLanguageModels() ?? [];
});
const availableImportDirectories = computed(() => {
  const directories = documentStore.nodes
    .filter((node) => node.kind === 'directory')
    .map((node) => ({
      path: node.path,
      label: node.path
    }));

  return [
    {
      path: '/',
      label: t('shared.rootDirectory')
    },
    ...directories
  ];
});
const activeAssistantDocument = computed(() => {
  const currentDocument = displayedDocument.value;
  if (!currentDocument) {
    return null;
  }

  const viewerCapabilities = documentStore.activePath
    ? documentStore.activeViewerCapabilities
    : (fallbackIndexDocumentIsActive.value ? documentStore.scopeIndexViewerCapabilities : null);
  if (!viewerCapabilities?.edit) {
    return currentDocument;
  }

  return {
    ...currentDocument,
    dataBase64: encodeTextDocument(displayedDraftContent.value)
  };
});

async function refreshInsertLinkTypes(): Promise<void> {
  const insertLinkTypes = contributionQuery?.value?.getInsertLinkTypes() ?? [];
  const input = {
    activePath: documentStore.activePath,
    activeDocument: activeAssistantDocument.value,
    activeScopeMetadata: documentStore.activeScopeMetadata,
    activeScopeKey: documentStore.activeScopeKey,
    selectedNodePath: documentStore.selectedNodePath,
    contextProvider: props.contextProvider
  };

  const resolved = await Promise.all(
    insertLinkTypes
      .filter((insertLinkType) => insertLinkType.supports(input))
      .map(async (insertLinkType) => ({
        id: insertLinkType.id,
        title: insertLinkType.title,
        titleKey: insertLinkType.titleKey,
        items: await insertLinkType.getItems(input)
      }))
  );

  activeInsertLinkTypes.value = resolved;
}

const insertLinkRefreshState = computed(() => {
  const insertLinkTypes = contributionQuery?.value?.getInsertLinkTypes() ?? [];
  const input = {
    activePath: documentStore.activePath,
    activeDocument: activeAssistantDocument.value,
    activeScopeMetadata: documentStore.activeScopeMetadata,
    activeScopeKey: documentStore.activeScopeKey,
    selectedNodePath: documentStore.selectedNodePath,
    contextProvider: props.contextProvider
  };

  return insertLinkTypes
    .filter((insertLinkType) => insertLinkType.supports(input))
    .map((insertLinkType) => ({
      id: insertLinkType.id,
      refreshKey: insertLinkType.getRefreshKey?.(input) ?? null
    }));
});

async function onMoveNode(input: { path: string; targetParentPath?: string }) {
  const movedNode = documentStore.findNodeByPath(input.path);
  const targetParentPath = input.targetParentPath ?? '/';

  const nodeName = movedNode?.name ?? input.path.split('/').pop() ?? '';
  const name = input.path.split('/').pop();
  if (name === 'references' && movedNode?.kind === 'directory') {
    moveErrorReason.value = 'references-dir';
    showMoveError.value = true;
    return;
  }

  const targetNode = targetParentPath !== '/' ? documentStore.findNodeByPath(targetParentPath) : null;
  if (movedNode?.scopeKey && targetNode?.scopeKey && movedNode.scopeKey !== targetNode.scopeKey) {
    moveErrorReason.value = 'cross-scope';
    showMoveError.value = true;
    return;
  }

  let hasLinks = false;
  if (movedNode?.kind === 'file' && (input.path.endsWith('.md') || input.path.endsWith('.markdown'))) {
    try {
      const doc = await props.contextProvider.readDocument(input.path);
      if (isTextDocumentMimeType(doc.mimeType)) {
        const content = decodeTextDocument(doc.dataBase64);
        const fromDir = input.path.slice(0, Math.max(0, input.path.lastIndexOf('/'))) || '/';
        hasLinks = content !== rewriteOutgoingLinks(content, fromDir, targetParentPath);
      }
    } catch {
      // ignore — proceed without warning
    }
  }

  pendingMoveInput.value = input;
  pendingNodeName.value = nodeName;
  pendingDestPath.value = targetParentPath;
  pendingHasLinks.value = hasLinks;
  showMoveConfirm.value = true;
}

async function onMoveConfirm() {
  showMoveConfirm.value = false;
  if (!pendingMoveInput.value) {
    return;
  }
  await documentStore.moveNode(pendingMoveInput.value);
  pendingMoveInput.value = null;
}

function onMoveCancel() {
  showMoveConfirm.value = false;
  pendingMoveInput.value = null;
}

function requestWorkspaceSwitch(path: ChatRoutePath): void {
  emit('request-workspace-switch', path);
}

async function syncWorkspaceConversationSelection(): Promise<void> {
  if (!isWorkspaceSelectionReady.value) {
    return;
  }

  await runtimeContext?.value?.publishWorkspaceSelectionChanged({
    activeScopeMetadata: documentStore.activeScopeMetadata,
    activeScopeKey: documentStore.activeScopeKey,
    selectedNodePath: documentStore.selectedNodePath,
    activePath: documentStore.activePath,
    activeDocument: activeAssistantDocument.value,
    contextProvider: props.contextProvider,
    onFileChanged: handleAssistantFileChanged
  });
}

function toggleTreeDrawer(): void {
  assistantDrawerOpen.value = false;
  treeDrawerOpen.value = !treeDrawerOpen.value;
}

function toggleAssistantDrawer(): void {
  treeDrawerOpen.value = false;
  assistantDrawerOpen.value = !assistantDrawerOpen.value;
}

async function onOpenNode(path: string) {
  treeDrawerOpen.value = false;
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

function resolveImportParentPath(path: string | null): string {
  if (!path || path === '/') {
    return '/';
  }

  const node = documentStore.findNodeByPath(path);
  if (node?.kind === 'directory') {
    return path;
  }

  const lastSlash = path.lastIndexOf('/');
  return lastSlash <= 0 ? '/' : path.slice(0, lastSlash);
}

function openImportWizard(): void {
  importWizardTargetParentPath.value = resolveImportParentPath(
    documentStore.selectedNodePath ?? documentStore.activePath ?? '/'
  );
  showImportWizard.value = true;
}

async function onOpenConversationLink(target: MarkdownConversationLinkTarget): Promise<void> {
  if (!documentStore.activeScopeKey) {
    return;
  }

  openConversationRequest.value = {
    conversationId: target.conversationId,
    nonce: Date.now()
  };
}

watch(() => props.panelSizes, (value) => {
  documentStore.setPanelSizes(value);
}, { immediate: true });

watch(
  () => insertLinkRefreshState.value,
  () => {
    void refreshInsertLinkTypes();
  },
  { immediate: true }
);

watch(() => props.contextProvider, async (provider) => {
  isWorkspaceSelectionReady.value = false;
  hasRestoredPersistedSelection.value = false;
  const shouldResetWorkspace = documentStore.contextProvider !== provider;

  if (shouldResetWorkspace) {
    documentStore.setContextProvider(provider);
  }

  if (!provider) {
    isWorkspaceSelectionReady.value = true;
    return;
  }

  if (shouldResetWorkspace || !documentStore.accessInitialized) {
    await documentStore.hydrateWorkspace();
  }

  if (!hasRestoredPersistedSelection.value) {
    await documentStore.restorePersistedSelection();
    hasRestoredPersistedSelection.value = true;
  }

  isWorkspaceSelectionReady.value = true;
  await syncWorkspaceConversationSelection();
}, { immediate: true });

watch(
  runtimeContext ?? ref(null),
  () => {
    void syncWorkspaceConversationSelection();
  },
  { flush: 'sync' }
);

watch(
  () => [documentStore.selectedNodePath, documentStore.activePath] as const,
  () => {
    if (isWorkspaceSelectionReady.value) {
      documentStore.persistSelectionSnapshot();
    }
    void syncWorkspaceConversationSelection();
  },
  { immediate: true, flush: 'sync' }
);

watch(
  () => [documentStore.activeScopeKey, documentStore.activePath, activeAssistantDocument.value, props.contextProvider] as const,
  () => {
    void runtimeContext?.value?.publishWorkspaceSelectionChanged({
      activeScopeMetadata: documentStore.activeScopeMetadata,
      activeScopeKey: documentStore.activeScopeKey,
      selectedNodePath: documentStore.selectedNodePath,
      activePath: documentStore.activePath,
      activeDocument: activeAssistantDocument.value,
      contextProvider: props.contextProvider,
      onFileChanged: handleAssistantFileChanged
    });
  },
  { immediate: true, flush: 'sync' }
);

let cleanupResize: (() => void) | null = null;

function onDraftChange(markdown: string) {
  if (fallbackIndexDocumentIsActive.value && !documentStore.activePath) {
    documentStore.updateScopeIndexDocument(markdown);
    return;
  }

  documentStore.updateActiveDocument(markdown);
}

function onSaveDisplayedDocument() {
  if (fallbackIndexDocumentIsActive.value && !documentStore.activePath) {
    return documentStore.flushScopeIndexDocument();
  }

  return documentStore.flushActiveDocument();
}

async function onRefreshDisplayedDocument() {
  if (!documentStore.activePath) {
    return;
  }

  if (displayedDocumentIsDirty.value && !window.confirm(t('shared.refreshCurrentDocumentConfirm'))) {
    return;
  }

  await documentStore.reloadActiveDocumentFromDisk();
}

function handleAssistantFileChanged(change: { path: string; beforeContent: string; afterContent: string; alreadyPersisted?: boolean }) {
  if (change.alreadyPersisted) {
    documentStore.recordFileChange(change);
    return;
  }

  return documentStore.applyGeneratedDocumentChange(change);
}

async function runDocumentImport(input: {
  contribution: {
    run(runInput: {
      params: unknown;
      targetParentPath: string;
      hostApi: {
        createDocument(path: string, content: string): Promise<void>;
        createReferenceResource(
          ownerDocumentPath: string,
          filename: string,
          content: string
        ): Promise<{ resourcePath: string; relativePathFromOwner: string }>;
        openDocument(path: string): Promise<void>;
        report(message: { type: 'success' | 'error'; text: string }): void;
        setStage(stage: { key: string; label: string; status: 'running' | 'completed' | 'failed'; detail?: string }): void;
      };
      signal?: AbortSignal;
    }): Promise<{ primaryDocumentPath: string; createdPaths: string[] }>;
  };
  params: unknown;
  targetParentPath: string;
  onStageChange: (stage: { key: string; label: string; status: 'running' | 'completed' | 'failed'; detail?: string }) => void;
}): Promise<void> {
  const hostApi = {
    createDocument(path: string, content: string) {
      return documentStore.createImportedDocument({ path, content });
    },
    createReferenceResource(ownerDocumentPath: string, filename: string, content: string) {
      return documentStore.createImportedReferenceResource({
        ownerDocumentPath,
        fileName: filename,
        content
      });
    },
    openDocument(path: string) {
      return documentStore.openNode(path);
    },
    report(message: { type: 'success' | 'error'; text: string }) {
      runtimeContext?.value?.postPluginMessage({
        id: `document-import-${Date.now()}`,
        level: message.type === 'error' ? 'error' : 'info',
        message: message.text
      });
    },
    setStage(stage: { key: string; label: string; status: 'running' | 'completed' | 'failed'; detail?: string }) {
      input.onStageChange(stage);
    }
  };

  try {
    const result = await input.contribution.run({
      params: input.params,
      targetParentPath: input.targetParentPath,
      hostApi
    });
    await hostApi.openDocument(result.primaryDocumentPath);
    hostApi.report({
      type: 'success',
      text: t('shared.importSucceeded')
    });
  } catch (error) {
    hostApi.report({
      type: 'error',
      text: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
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
  if (!shell || isNarrowViewport.value) {
    return;
  }

  if (documentStore.conversationFocusMode) {
    if (handleIndex === 0) {
      return;
    }

    startConversationFocusResize(shell, event);
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

function startConversationFocusResize(shell: HTMLElement, event: PointerEvent) {
  event.preventDefault();
  const startX = event.clientX;
  const startSizes = [...documentStore.conversationFocusPanelSizes] as [number, number];
  const shellWidth = shell.getBoundingClientRect().width;

  const onMove = (moveEvent: PointerEvent) => {
    const deltaPercent = ((moveEvent.clientX - startX) / shellWidth) * 100;
    documentStore.setConversationFocusPanelSizes([
      startSizes[0] + deltaPercent,
      startSizes[1] - deltaPercent
    ]);
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

/* Narrow (mobile) mode: single column, file tree as overlay drawer. */
.knowledge-grid--narrow .resize-handle {
  display: none;
}

.knowledge-grid--narrow .grid-pane--assistant {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(90vw, 420px);
  z-index: 60;
  transform: translateX(100%);
  transition: transform 0.2s ease;
  background: linear-gradient(180deg, #060b12, #0b1220);
  border-left: 1px solid rgba(56, 189, 248, 0.25);
  box-shadow: 0 0 32px rgba(2, 6, 12, 0.6);
}

.knowledge-grid--narrow .grid-pane--assistant.grid-pane--assistant-open {
  transform: translateX(0);
}

.knowledge-grid--narrow .grid-pane--tree {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: min(85vw, 340px);
  z-index: 60;
  transform: translateX(-100%);
  transition: transform 0.2s ease;
  background: linear-gradient(180deg, #060b12, #0b1220);
  border-right: 1px solid rgba(56, 189, 248, 0.25);
  box-shadow: 0 0 32px rgba(2, 6, 12, 0.6);
}

.knowledge-grid--narrow .grid-pane--tree.grid-pane--tree-open {
  transform: translateX(0);
}

.tree-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(2, 6, 12, 0.55);
}

.tree-drawer-toggle {
  position: fixed;
  left: 14px;
  bottom: 18px;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(56, 189, 248, 0.4);
  background: rgba(11, 18, 32, 0.92);
  color: #7dd3fc;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(2, 6, 12, 0.55);
}

.assistant-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(2, 6, 12, 0.55);
}

.assistant-drawer-toggle {
  position: fixed;
  right: 14px;
  bottom: 18px;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(56, 189, 248, 0.4);
  background: rgba(11, 18, 32, 0.92);
  color: #7dd3fc;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(2, 6, 12, 0.55);
}
</style>
