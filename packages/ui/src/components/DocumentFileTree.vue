<template>
  <aside class="file-tree" data-testid="document-file-tree">
    <header class="tree-header">
      <div class="tree-actions">
        <button
          type="button"
          class="tree-icon-button"
          data-testid="document-refresh-tree"
          :title="t('shared.refreshTree')"
          :aria-label="t('shared.refreshTree')"
          @mouseenter="showTooltip($event, t('shared.refreshTree'))"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, t('shared.refreshTree'))"
          @blur="hideTooltip"
          @click="emit('refresh')"
        >
          <RefreshCw class="tree-icon" :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="tree-icon-button"
          data-testid="document-enable-directory-metadata"
          :title="t('shared.enableDirectoryMetadata')"
          :aria-label="t('shared.enableDirectoryMetadata')"
          :disabled="!canEnableSelectedDirectoryMetadata"
          @mouseenter="showTooltip($event, t('shared.enableDirectoryMetadata'))"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, t('shared.enableDirectoryMetadata'))"
          @blur="hideTooltip"
          @click="enableSelectedDirectoryMetadata"
        >
          <Bot class="tree-icon" :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="tree-icon-button"
          data-testid="document-delete-node"
          :title="t('shared.deleteSelectedNode')"
          :aria-label="t('shared.deleteSelectedNode')"
          :disabled="!canDeleteSelectedNode"
          @mouseenter="showTooltip($event, t('shared.deleteSelectedNode'))"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, t('shared.deleteSelectedNode'))"
          @blur="hideTooltip"
          @click="beginDeleteConfirmation"
        >
          <Trash2 class="tree-icon" :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="tree-icon-button"
          data-testid="document-new-file"
          :title="t('shared.createFile')"
          :aria-label="t('shared.createFile')"
          @mouseenter="showTooltip($event, t('shared.createFile'))"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, t('shared.createFile'))"
          @blur="hideTooltip"
          @click="createNode('file')"
        >
          <FilePlus class="tree-icon" :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="tree-icon-button"
          data-testid="document-import"
          :title="t('shared.importDocument')"
          :aria-label="t('shared.importDocument')"
          @mouseenter="showTooltip($event, t('shared.importDocument'))"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, t('shared.importDocument'))"
          @blur="hideTooltip"
          @click="emit('import')"
        >
          <FileText class="tree-icon" :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="tree-icon-button"
          data-testid="document-new-directory"
          :title="t('shared.createDirectory')"
          :aria-label="t('shared.createDirectory')"
          @mouseenter="showTooltip($event, t('shared.createDirectory'))"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, t('shared.createDirectory'))"
          @blur="hideTooltip"
          @click="createNode('directory')"
        >
          <FolderPlus class="tree-icon" :size="18" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div v-if="currentError" class="tree-error" data-testid="document-error">
      {{ currentError }}
    </div>

    <div
      v-if="deleteConfirmation.active"
      class="tree-confirm"
      data-testid="document-delete-confirm"
    >
      <div class="tree-confirm-text">
        {{ deleteConfirmation.message }}
      </div>
      <div class="tree-confirm-actions">
        <button type="button" class="tree-confirm-button danger" data-testid="document-delete-confirm-yes" @click="confirmDelete">
          {{ t('shared.confirmDelete') }}
        </button>
        <button type="button" class="tree-confirm-button" data-testid="document-delete-confirm-no" @click="cancelDeleteConfirmation">
          {{ t('shared.cancel') }}
        </button>
      </div>
    </div>

    <div v-else class="tree-list">
      <section
        v-if="recentNodes.length > 0"
        class="tree-recent-section"
        data-testid="document-recent-section"
      >
        <button
          type="button"
          class="tree-row tree-row--section-toggle"
          :class="{ directory: true }"
          data-testid="document-recent-toggle"
          @click="toggleRecentSection"
        >
          <span class="tree-toggle" aria-hidden="true">
            {{ recentSectionExpanded ? '▾' : '▸' }}
          </span>
          <span class="tree-label">{{ t('shared.recentNodes') }}</span>
        </button>
        <button
          v-for="node in recentSectionExpanded ? recentNodes : []"
          :key="`recent:${node.path}`"
          type="button"
          class="tree-row tree-row--recent"
          :class="{
            active: node.path === activePath,
            directory: node.kind === 'directory'
          }"
          data-testid="document-recent-node"
          :data-path="node.path"
          :title="node.path"
          @click="onRecentNodeClick(node)"
        >
          <span class="tree-toggle" aria-hidden="true" />
          <span class="tree-label-group">
            <span
              v-if="resolveNodePresentation(node)?.icon === 'bot'"
              :data-testid="node.ownsMetadata ? 'document-node-metadata-owner' : undefined"
              class="tree-scope-icon-wrap"
            >
              <Bot
                class="tree-scope-icon"
                :size="14"
                aria-hidden="true"
                data-testid="document-node-presentation-icon"
                data-icon-id="bot"
              />
            </span>
            <component
              :is="resolveNodeIcon(node)"
              v-if="resolveNodeIcon(node)"
              class="tree-file-icon"
              :size="14"
              aria-hidden="true"
              data-testid="document-node-file-icon"
              :data-icon-kind="getContextNodeIconKind(node) ?? undefined"
            />
            <span class="tree-label">{{ getNodeLabel(node) }}</span>
          </span>
        </button>
      </section>
      <button
        v-for="item in visibleNodes"
        :key="item.node.path"
        type="button"
        class="tree-row"
        :class="{
          active: item.node.path === activePath,
          directory: item.node.kind === 'directory',
          'tree-row--dragging': dragState.draggedPath === item.node.path,
          'tree-row--drop-target': dragState.dropTargetPath === item.node.path && canDropOnNode(item.node)
        }"
        :data-testid="item.isRoot ? 'document-node-root' : `document-node-${item.node.kind}`"
        :data-path="item.node.path"
        :style="{ paddingLeft: `${12 + item.depth * 18}px` }"
        :draggable="!item.isInlineEditing && !item.isRoot"
        @click="onNodeClick(item.node)"
        @dblclick="beginRename(item.node)"
        @dragstart="onDragStart(item.node, $event)"
        @dragover="onDragOver(item.node, $event)"
        @dragleave="onDragLeave(item.node)"
        @drop="onDrop(item.node, $event)"
        @dragend="clearDragState"
      >
        <span class="tree-toggle" @click.stop="onToggleClick(item.node)">
          <template v-if="!item.isInlineEditing && item.node.kind === 'directory'">
            {{ expandedPaths.includes(item.node.path) ? '▾' : '▸' }}
          </template>
        </span>
        <input
          v-if="item.isInlineEditing"
          ref="pendingInputRef"
          v-model="inlineEdit.name"
          class="tree-inline-input"
          :data-testid="inlineEdit.mode === 'create' ? 'document-pending-node-input' : 'document-rename-node-input'"
          :placeholder="inlineEdit.kind === 'file' ? t('shared.inputFileName') : t('shared.inputDirectoryName')"
          @click.stop
          @keydown.enter.prevent="submitInlineEdit"
          @keydown.esc.prevent="cancelInlineEdit"
          @blur="handleInlineInputBlur"
        >
        <span v-else class="tree-label-group">
          <span
            v-if="resolveNodePresentation(item.node)?.icon === 'bot'"
            :data-testid="item.node.ownsMetadata ? 'document-node-metadata-owner' : undefined"
            class="tree-scope-icon-wrap"
          >
            <Bot
              class="tree-scope-icon"
              :size="14"
              aria-hidden="true"
              data-testid="document-node-presentation-icon"
              data-icon-id="bot"
            />
          </span>
          <component
            :is="resolveNodeIcon(item.node)"
            v-if="resolveNodeIcon(item.node)"
            class="tree-file-icon"
            :size="14"
            aria-hidden="true"
            data-testid="document-node-file-icon"
            :data-icon-kind="getContextNodeIconKind(item.node) ?? undefined"
          />
          <span class="tree-label">{{ getNodeLabel(item.node) }}</span>
          <span
            v-if="resolveNodePresentation(item.node)?.badge"
            class="tree-node-badge"
            data-testid="document-node-presentation-badge"
          >
            {{ resolveNodePresentation(item.node)?.badge }}
          </span>
          <span
            v-if="resolveNodePresentation(item.node)?.labelSuffix"
            class="tree-node-suffix"
            data-testid="document-node-presentation-suffix"
          >
            {{ resolveNodePresentation(item.node)?.labelSuffix }}
          </span>
        </span>
      </button>
    </div>
  </aside>
  <Teleport to="body">
    <div
      v-if="tooltipState.visible"
      class="floating-tooltip"
      role="tooltip"
      :style="{ left: `${tooltipState.left}px`, top: `${tooltipState.top}px` }"
    >
      {{ tooltipState.text }}
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, reactive, ref, watch } from 'vue';
import { Bot, FileJson2, FilePlus, FileText, FileType2, FolderPlus, Image, RefreshCw, Trash2 } from 'lucide-vue-next';
import type { ContextNode, NodePresentationResult } from '@packages/core/src';
import { useWorkspaceI18n } from '../i18n';
import { contributionQueryKey } from '../plugins/injectionKeys';
import { getContextNodeDisplayName, getContextNodeIconKind, isMarkdownDisplayName } from '../utils/contextNodePresentation';

const props = withDefaults(defineProps<{
  nodes: ContextNode[];
  recentNodes?: ContextNode[];
  expandedPaths: string[];
  activePath: string | null;
  currentError: string | null;
}>(), {
  recentNodes: () => []
});

const emit = defineEmits<{
  (event: 'open', path: string): void;
  (event: 'toggle-expand', path: string): void;
  (event: 'create', input: { parentPath?: string; name: string; kind: 'file' | 'directory' }): void;
  (event: 'enable-directory-metadata', path: string): void;
  (event: 'delete', path: string): void;
  (event: 'rename', input: { path: string; name: string }): void;
  (event: 'move', input: { path: string; targetParentPath?: string }): void;
  (event: 'refresh'): void;
  (event: 'import'): void;
}>();

const RECENT_SECTION_EXPANDED_STORAGE_KEY = 'jarvis:knowledge-workspace:recent-section-expanded';

const pendingInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null);
const recentSectionExpanded = ref(readRecentSectionExpanded());
const inlineEdit = reactive<{
  active: boolean;
  mode: 'create' | 'rename';
  kind: 'file' | 'directory';
  name: string;
  parentPath?: string;
  path?: string;
}>({
  active: false,
  mode: 'create',
  kind: 'file',
  name: '',
  parentPath: undefined,
  path: undefined
});
const deleteConfirmation = reactive<{
  active: boolean;
  path: string | null;
  message: string;
}>({
  active: false,
  path: null,
  message: ''
});
const { t } = useWorkspaceI18n();
const contributionQuery = inject(contributionQueryKey, null);
const nodePresentations = ref<Record<string, NodePresentationResult>>({});

const activeNode = computed(() => {
  if (!props.activePath || props.activePath === '/') {
    return null;
  }

  return props.nodes.find((node) => node.path === props.activePath) ?? null;
});

const canDeleteSelectedNode = computed(() => !!activeNode.value);
const canEnableSelectedDirectoryMetadata = computed(() => {
  return activeNode.value?.kind === 'directory' && activeNode.value.ownsMetadata !== true;
});

const tooltipState = reactive({
  text: '',
  top: 0,
  left: 0,
  visible: false
});
const dragState = reactive<{
  draggedPath: string | null;
  dropTargetPath: string | null;
}>({
  draggedPath: null,
  dropTargetPath: null
});

const childrenByParent = computed(() => {
  const grouped = new Map<string, ContextNode[]>();

  props.nodes.forEach((node) => {
    const key = node.parentPath ?? '__root__';
    const bucket = grouped.get(key) ?? [];
    bucket.push(node);
    grouped.set(key, bucket);
  });

  grouped.forEach((bucket) => {
    bucket.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name, 'zh-Hans-CN');
    });
  });

  return grouped;
});

const visibleNodes = computed(() => {
  const rootNode: ContextNode = {
    path: '/',
    name: t('shared.rootDirectory'),
    kind: 'directory',
    hasChildren: true,
    scopeKey: '__default__'
  };
  const rows: Array<{ node: ContextNode; depth: number; isRoot?: boolean; isInlineEditing?: boolean }> = [
    { node: rootNode, depth: 0, isRoot: true }
  ];

  function walk(parentPath: string | undefined, depth: number) {
    const key = parentPath ?? '__root__';
    const children = childrenByParent.value.get(key) ?? [];

    children.forEach((node) => {
      const isInlineEditing = inlineEdit.active && inlineEdit.mode === 'rename' && inlineEdit.path === node.path;
      rows.push({ node, depth, isInlineEditing });
      if (node.kind === 'directory' && props.expandedPaths.includes(node.path)) {
        walk(node.path, depth + 1);
      }
    });

    if (inlineEdit.active && inlineEdit.mode === 'create' && inlineEdit.parentPath === parentPath) {
      rows.push({
        node: {
          path: '__pending__',
          name: inlineEdit.name,
          kind: inlineEdit.kind,
          scopeKey: inlineEdit.parentPath ?? '__default__'
        },
        depth,
        isInlineEditing: true
      });
    }
  }

  if (props.expandedPaths.includes('/')) {
    walk(undefined, 1);
  }
  return rows;
});

function getNodePresentationContributions() {
  const query = contributionQuery?.value;
  if (!query || typeof query.getNodePresentations !== 'function') {
    return [];
  }

  return query.getNodePresentations();
}

function mergeNodePresentation(
  base: NodePresentationResult | null,
  incoming: NodePresentationResult
): NodePresentationResult {
  return {
    icon: base?.icon ?? incoming.icon,
    badge: base?.badge ?? incoming.badge,
    labelSuffix: base?.labelSuffix ?? incoming.labelSuffix,
    accentTone: base?.accentTone ?? incoming.accentTone
  };
}

watch(
  [() => props.nodes, getNodePresentationContributions],
  async ([nodes, contributions]) => {
    const nextPresentations: Record<string, NodePresentationResult> = {};

    for (const node of nodes) {
      let merged: NodePresentationResult | null = null;

      for (const contribution of [...contributions].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))) {
        const supported = await contribution.supports(node);
        if (!supported) {
          continue;
        }

        const presentation = await contribution.getPresentation(node);
        if (!presentation) {
          continue;
        }

        merged = mergeNodePresentation(merged, presentation);
      }

      if (merged) {
        nextPresentations[node.path] = merged;
      }
    }

    nodePresentations.value = nextPresentations;
  },
  { immediate: true, deep: true }
);

function resolveNodePresentation(node: ContextNode): NodePresentationResult | null {
  return nodePresentations.value[node.path] ?? null;
}

function onNodeClick(node: ContextNode) {
  emit('open', node.path);
}

function onRecentNodeClick(node: ContextNode) {
  emit('open', node.path);
}

function readRecentSectionExpanded(): boolean {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return false;
  }

  try {
    return globalThis.localStorage.getItem(RECENT_SECTION_EXPANDED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistRecentSectionExpanded() {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return;
  }

  try {
    globalThis.localStorage.setItem(
      RECENT_SECTION_EXPANDED_STORAGE_KEY,
      recentSectionExpanded.value ? 'true' : 'false'
    );
  } catch {
    // Ignore storage availability failures and keep the tree interactive.
  }
}

function toggleRecentSection() {
  recentSectionExpanded.value = !recentSectionExpanded.value;
  persistRecentSectionExpanded();
}

function onToggleClick(node: ContextNode) {
  if (node.kind === 'directory') {
    emit('toggle-expand', node.path);
  }
}

function clearDragState() {
  dragState.draggedPath = null;
  dragState.dropTargetPath = null;
}

function isReferencesDirectory(nodePath: string): boolean {
  const name = nodePath.split('/').pop();
  return name === 'references';
}

function canDropOnNode(node: ContextNode): boolean {
  if (!dragState.draggedPath || node.kind !== 'directory') {
    return false;
  }

  if (dragState.draggedPath === node.path) {
    return false;
  }

  if (node.path.startsWith(`${dragState.draggedPath}/`)) {
    return false;
  }

  if (isReferencesDirectory(dragState.draggedPath)) {
    return false;
  }

  const draggedNode = props.nodes.find((candidate) => candidate.path === dragState.draggedPath);
  const currentParentPath = draggedNode?.parentPath;
  const targetParentPath = node.path === '/' ? undefined : node.path;
  if ((currentParentPath ?? undefined) === targetParentPath) {
    return false;
  }

  return true;
}

function onDragStart(node: ContextNode, event: DragEvent) {
  if (node.path === '/' || inlineEdit.active) {
    event.preventDefault();
    return;
  }

  dragState.draggedPath = node.path;
  dragState.dropTargetPath = null;
  event.dataTransfer?.setData('text/plain', node.path);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function onDragOver(node: ContextNode, event: DragEvent) {
  if (!canDropOnNode(node)) {
    return;
  }

  event.preventDefault();
  dragState.dropTargetPath = node.path;
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function onDragLeave(node: ContextNode) {
  if (dragState.dropTargetPath === node.path) {
    dragState.dropTargetPath = null;
  }
}

function onDrop(node: ContextNode, event: DragEvent) {
  if (!canDropOnNode(node) || !dragState.draggedPath) {
    clearDragState();
    return;
  }

  event.preventDefault();
  emit('move', {
    path: dragState.draggedPath,
    targetParentPath: node.path === '/' ? undefined : node.path
  });
  clearDragState();
}

function resolveCreationParentPath(): string | undefined {
  if (!props.activePath || props.activePath === '/') {
    return undefined;
  }

  const selectedNode = props.nodes.find((node) => node.path === props.activePath);
  if (!selectedNode) {
    return undefined;
  }

  return selectedNode.kind === 'directory'
    ? selectedNode.path
    : selectedNode.parentPath;
}

function cancelInlineEdit() {
  inlineEdit.active = false;
  inlineEdit.mode = 'create';
  inlineEdit.name = '';
  inlineEdit.parentPath = undefined;
  inlineEdit.path = undefined;
}

function cancelDeleteConfirmation() {
  deleteConfirmation.active = false;
  deleteConfirmation.path = null;
  deleteConfirmation.message = '';
}

function beginDeleteConfirmation() {
  if (!activeNode.value) {
    return;
  }

  deleteConfirmation.active = true;
  deleteConfirmation.path = activeNode.value.path;
  deleteConfirmation.message = activeNode.value.kind === 'directory'
    ? t('shared.confirmDeleteDirectory', { name: activeNode.value.name })
    : t('shared.confirmDeleteFile', { name: activeNode.value.name });
}

function enableSelectedDirectoryMetadata() {
  if (!canEnableSelectedDirectoryMetadata.value || !activeNode.value) {
    return;
  }

  emit('enable-directory-metadata', activeNode.value.path);
}

function confirmDelete() {
  if (!deleteConfirmation.path) {
    return;
  }

  emit('delete', deleteConfirmation.path);
  cancelDeleteConfirmation();
}

function submitInlineEdit() {
  const name = inlineEdit.name.trim();
  if (!name) {
    cancelInlineEdit();
    return;
  }

  if (inlineEdit.mode === 'create') {
    emit('create', {
      name,
      kind: inlineEdit.kind,
      parentPath: inlineEdit.parentPath
    });
    cancelInlineEdit();
    return;
  }

  if (inlineEdit.path) {
    emit('rename', {
      path: inlineEdit.path,
      name
    });
  }
  cancelInlineEdit();
}

function createNode(kind: 'file' | 'directory') {
  const parentPath = resolveCreationParentPath();
  if (parentPath && !props.expandedPaths.includes(parentPath)) {
    emit('open', parentPath);
  }

  inlineEdit.active = true;
  inlineEdit.mode = 'create';
  inlineEdit.kind = kind;
  inlineEdit.name = '';
  inlineEdit.parentPath = parentPath;
  inlineEdit.path = undefined;

  void nextTick(() => {
    const target = Array.isArray(pendingInputRef.value)
      ? pendingInputRef.value[0]
      : pendingInputRef.value;
    if (target instanceof HTMLInputElement) {
      target.focus();
    }
  });
}

function beginRename(node: ContextNode) {
  if (node.path === '/') {
    return;
  }

  inlineEdit.active = true;
  inlineEdit.mode = 'rename';
  inlineEdit.kind = node.kind;
  inlineEdit.name = node.kind === 'file' && isMarkdownDisplayName(node.name)
    ? getContextNodeDisplayName(node.name)
    : node.name;
  inlineEdit.parentPath = node.parentPath;
  inlineEdit.path = node.path;

  void nextTick(() => {
    const target = Array.isArray(pendingInputRef.value)
      ? pendingInputRef.value[0]
      : pendingInputRef.value;
    if (target instanceof HTMLInputElement) {
      target.focus();
      target.select();
    }
  });
}

function handleInlineInputBlur() {
  if (inlineEdit.name.trim()) {
    submitInlineEdit();
    return;
  }

  cancelInlineEdit();
}

function showTooltip(event: MouseEvent | FocusEvent, text: string) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const rect = target.getBoundingClientRect();
  tooltipState.text = text;
  tooltipState.left = rect.left + rect.width / 2;
  tooltipState.top = rect.top - 8;
  tooltipState.visible = true;
}

function hideTooltip() {
  tooltipState.visible = false;
}

function getNodeLabel(node: ContextNode): string {
  return node.kind === 'file'
    ? getContextNodeDisplayName(node.name)
    : node.name;
}

function resolveNodeIcon(node: ContextNode) {
  switch (getContextNodeIconKind(node)) {
    case 'image':
      return Image;
    case 'json':
      return FileJson2;
    case 'pdf':
    case 'text':
      return FileText;
    case 'file':
      return FileType2;
    default:
      return null;
  }
}
</script>

<style scoped>
.file-tree {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.1), transparent 28%),
    linear-gradient(180deg, rgba(7, 12, 18, 0.98), rgba(10, 14, 22, 0.94));
}

.tree-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 10px 12px 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.tree-actions {
  display: flex;
  gap: 2px;
}

.tree-icon-button {
  border: 0;
  border-radius: 8px;
  width: 28px;
  height: 28px;
  padding: 0;
  color: rgba(226, 232, 240, 0.86);
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.tree-icon {
  width: 18px;
  height: 18px;
}

.tree-icon-button:hover,
.tree-icon-button:focus-visible {
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
}

.tree-icon-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.floating-tooltip {
  position: fixed;
  transform: translate(-50%, -100%);
  padding: 5px 8px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.24);
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.1;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  z-index: 9999;
}

.tree-list {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  overflow: auto;
  padding: 8px 0 12px;
}

.tree-recent-section {
  display: flex;
  flex-direction: column;
  padding: 0;
  margin: 0;
}

.tree-confirm {
  margin: 10px 12px 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(127, 29, 29, 0.22);
  border: 1px solid rgba(248, 113, 113, 0.25);
  color: #fecaca;
}

.tree-confirm-text {
  font-size: 12px;
  line-height: 1.5;
}

.tree-confirm-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.tree-confirm-button {
  border: 0;
  border-radius: 8px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  cursor: pointer;
}

.tree-confirm-button.danger {
  background: rgba(220, 38, 38, 0.72);
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  border: 0;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
  text-align: left;
}

.tree-row:hover {
  background: rgba(148, 163, 184, 0.08);
}

.tree-row.active {
  background: rgba(37, 99, 235, 0.18);
  color: #eff6ff;
}

.tree-row.directory {
  color: #e2e8f0;
}

.tree-row--recent {
  min-height: 34px;
  padding-left: 30px;
}

.tree-row--section-toggle {
  padding-left: 12px;
}

.tree-toggle {
  width: 16px;
  color: #94a3b8;
}

.tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-inline-input {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 6px;
  padding: 4px 8px;
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.92);
  outline: none;
}

.tree-label-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tree-row--dragging {
  opacity: 0.45;
}

.tree-row--drop-target {
  background: rgba(56, 189, 248, 0.18);
  box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.35);
}

.tree-scope-icon {
  color: #38bdf8;
  flex: 0 0 auto;
}

.tree-file-icon {
  color: rgba(148, 163, 184, 0.9);
  flex: 0 0 auto;
}

.tree-inline-input:focus {
  border-color: rgba(56, 189, 248, 0.72);
}

.tree-error {
  margin: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(127, 29, 29, 0.35);
  color: #fecaca;
}
</style>
