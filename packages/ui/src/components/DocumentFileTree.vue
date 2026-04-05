<template>
  <aside class="file-tree" data-testid="document-file-tree">
    <header class="tree-header">
      <div>
        <div class="tree-title">Knowledge</div>
      </div>
      <div class="tree-actions">
        <button
          type="button"
          class="tree-icon-button"
          data-testid="document-refresh-tree"
          title="刷新文件树"
          aria-label="刷新文件树"
          @mouseenter="showTooltip($event, '刷新文件树')"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, '刷新文件树')"
          @blur="hideTooltip"
          @click="emit('refresh')"
        >
          <RefreshCw class="tree-icon" :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="tree-icon-button"
          data-testid="document-delete-node"
          title="删除当前节点"
          aria-label="删除当前节点"
          :disabled="!canDeleteSelectedNode"
          @mouseenter="showTooltip($event, '删除当前节点')"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, '删除当前节点')"
          @blur="hideTooltip"
          @click="beginDeleteConfirmation"
        >
          <Trash2 class="tree-icon" :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="tree-icon-button"
          data-testid="document-new-file"
          title="新建文件"
          aria-label="新建文件"
          @mouseenter="showTooltip($event, '新建文件')"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, '新建文件')"
          @blur="hideTooltip"
          @click="createNode('file')"
        >
          <FilePlus class="tree-icon" :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="tree-icon-button"
          data-testid="document-new-directory"
          title="新建目录"
          aria-label="新建目录"
          @mouseenter="showTooltip($event, '新建目录')"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, '新建目录')"
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
          确认删除
        </button>
        <button type="button" class="tree-confirm-button" data-testid="document-delete-confirm-no" @click="cancelDeleteConfirmation">
          取消
        </button>
      </div>
    </div>

    <div v-else class="tree-list">
      <button
        v-for="item in visibleNodes"
        :key="item.node.path"
        type="button"
        class="tree-row"
        :class="{ active: item.node.path === activePath, directory: item.node.kind === 'directory' }"
        :data-testid="item.isRoot ? 'document-node-root' : `document-node-${item.node.kind}`"
        :data-path="item.node.path"
        :style="{ paddingLeft: `${12 + item.depth * 18}px` }"
        @click="onNodeClick(item.node)"
        @dblclick="beginRename(item.node)"
      >
        <span class="tree-toggle">
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
          :placeholder="inlineEdit.kind === 'file' ? '输入文件名' : '输入目录名'"
          @click.stop
          @keydown.enter.prevent="submitInlineEdit"
          @keydown.esc.prevent="cancelInlineEdit"
          @blur="handleInlineInputBlur"
        >
        <span v-else class="tree-label">{{ item.node.name }}</span>
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
import { computed, nextTick, reactive, ref } from 'vue';
import { FilePlus, FolderPlus, RefreshCw, Trash2 } from 'lucide-vue-next';
import type { ContextNode } from '@packages/core/src';

const props = defineProps<{
  nodes: ContextNode[];
  expandedPaths: string[];
  activePath: string | null;
  currentError: string | null;
}>();

const emit = defineEmits<{
  (event: 'open', path: string): void;
  (event: 'create', input: { parentPath?: string; name: string; kind: 'file' | 'directory' }): void;
  (event: 'delete', path: string): void;
  (event: 'rename', input: { path: string; name: string }): void;
  (event: 'refresh'): void;
}>();

const pendingInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null);
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

const activeNode = computed(() => {
  if (!props.activePath || props.activePath === '/') {
    return null;
  }

  return props.nodes.find((node) => node.path === props.activePath) ?? null;
});

const canDeleteSelectedNode = computed(() => !!activeNode.value);

const tooltipState = reactive({
  text: '',
  top: 0,
  left: 0,
  visible: false
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
    name: '根目录',
    kind: 'directory',
    hasChildren: true
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
          kind: inlineEdit.kind
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

function onNodeClick(node: ContextNode) {
  emit('open', node.path);
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
    ? `确认删除目录“${activeNode.value.name}”及其全部内容？`
    : `确认删除文件“${activeNode.value.name}”？`;
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
  inlineEdit.name = node.name;
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
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.tree-title {
  color: #e2e8f0;
  font-weight: 700;
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
