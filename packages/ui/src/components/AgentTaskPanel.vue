<template>
  <section class="agent-task-panel" data-testid="agent-task-panel">
    <div class="agent-task-panel__actions">
      <button
        type="button"
        class="agent-task-panel__add"
        data-testid="agent-task-add"
        :aria-label="t('shared.addTask')"
        :title="t('shared.addTask')"
        @click="startCreateTask"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M10 4.25a.75.75 0 0 1 .75.75v4.25H15a.75.75 0 0 1 0 1.5h-4.25V15a.75.75 0 0 1-1.5 0v-4.25H5a.75.75 0 0 1 0-1.5h4.25V5a.75.75 0 0 1 .75-.75Z" fill="currentColor" />
        </svg>
      </button>
    </div>

    <TaskEditorInline
      v-if="editingTask"
      :task="editingTask"
      @save="saveTask"
      @cancel="cancelEdit"
    />

    <p v-if="loading" class="agent-task-panel__message" data-testid="agent-task-loading">
      {{ t('shared.loadingTasks') }}
    </p>
    <p v-else-if="error" class="agent-task-panel__message agent-task-panel__message--error" data-testid="agent-task-error">
      {{ error }}
    </p>

    <template v-else>
      <div class="agent-task-panel__list" data-testid="agent-task-open-list">
        <article
          v-for="task in visibleOpenTasks"
          :key="task.id"
          class="agent-task-panel__item"
          :class="{ 'agent-task-panel__item--with-meta': Boolean(task.dueAt) }"
          :data-testid="`agent-task-item-${task.id}`"
        >
          <label class="agent-task-panel__check">
            <input
              type="checkbox"
              :checked="task.completed"
              :data-testid="`agent-task-complete-${task.id}`"
              @change="toggleTask(task, true)"
            />
            <span />
          </label>
          <div
            class="agent-task-panel__content"
            :data-testid="`agent-task-content-${task.id}`"
            @dblclick="startEditTaskFromRow(task)"
          >
            <div class="agent-task-panel__title-row">
              <div class="agent-task-panel__title-main">
                <span
                  v-if="task.calendarSyncStatus"
                  class="agent-task-panel__sync-status"
                  :class="`agent-task-panel__sync-status--${task.calendarSyncStatus}`"
                  :data-testid="`agent-task-sync-status-${task.id}`"
                  aria-hidden="true"
                />
                <strong>{{ task.title }}</strong>
              </div>
              <span v-if="task.priority" class="agent-task-panel__priority" :data-priority="task.priority">
                {{ formatPriority(task.priority) }}
              </span>
            </div>
            <p v-if="task.notes" class="agent-task-panel__notes">{{ task.notes }}</p>
          </div>
          <p v-if="task.dueAt" class="agent-task-panel__meta" :data-testid="`agent-task-due-at-${task.id}`">
            {{ formatDueAt(task.dueAt) }}
          </p>
          <div class="agent-task-panel__row-actions">
            <button
              type="button"
              class="agent-task-panel__menu-trigger"
              :data-testid="`agent-task-menu-${task.id}`"
              :aria-label="t('shared.moreActions')"
              @click="toggleMenu(task.id)"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <circle cx="4" cy="10" r="1.5" fill="currentColor" />
                <circle cx="10" cy="10" r="1.5" fill="currentColor" />
                <circle cx="16" cy="10" r="1.5" fill="currentColor" />
              </svg>
            </button>
            <div
              v-if="openMenuTaskId === task.id"
              class="agent-task-panel__menu"
              :data-testid="`agent-task-menu-panel-${task.id}`"
            >
              <button type="button" :data-testid="`agent-task-edit-${task.id}`" @click="openEditFromMenu(task)">{{ t('shared.editTask') }}</button>
              <button type="button" :data-testid="`agent-task-delete-${task.id}`" @click="deleteTaskFromMenu(task.id)">{{ t('shared.deleteTask') }}</button>
            </div>
          </div>
        </article>
        <p v-if="visibleOpenTasks.length === 0" class="agent-task-panel__message" data-testid="agent-task-empty">
          {{ t('shared.noTasks') }}
        </p>
      </div>

      <section class="agent-task-panel__completed">
        <button
          type="button"
          class="agent-task-panel__completed-toggle"
          data-testid="agent-task-completed-toggle"
          :aria-expanded="!completedCollapsed"
          @click="completedCollapsed = !completedCollapsed"
        >
          <span>{{ t('shared.completedTasks', { count: completedTasks.length }) }}</span>
          <svg
            class="agent-task-panel__completed-chevron"
            :class="{ 'agent-task-panel__completed-chevron--expanded': !completedCollapsed }"
            viewBox="0 0 20 20"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m6 8 4 4 4-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" />
          </svg>
        </button>
        <div v-if="!completedCollapsed" class="agent-task-panel__list" data-testid="agent-task-completed-list">
          <article
            v-for="task in visibleCompletedTasks"
            :key="task.id"
            class="agent-task-panel__item agent-task-panel__item--completed"
            :class="{ 'agent-task-panel__item--with-meta': Boolean(task.dueAt) }"
          >
            <label class="agent-task-panel__check">
              <input
                type="checkbox"
                checked
                :data-testid="`agent-task-reopen-${task.id}`"
                @change="toggleTask(task, false)"
              />
              <span />
            </label>
            <div class="agent-task-panel__content">
              <div class="agent-task-panel__title-row">
                <div class="agent-task-panel__title-main">
                  <span
                    v-if="task.calendarSyncStatus"
                    class="agent-task-panel__sync-status"
                    :class="`agent-task-panel__sync-status--${task.calendarSyncStatus}`"
                    :data-testid="`agent-task-sync-status-${task.id}`"
                    aria-hidden="true"
                  />
                  <strong>{{ task.title }}</strong>
                </div>
              </div>
              <p v-if="task.notes" class="agent-task-panel__notes">{{ task.notes }}</p>
            </div>
            <p v-if="task.dueAt" class="agent-task-panel__meta" :data-testid="`agent-task-due-at-${task.id}`">
              {{ formatDueAt(task.dueAt) }}
            </p>
            <div class="agent-task-panel__row-actions">
              <button
                type="button"
                class="agent-task-panel__menu-trigger"
                :data-testid="`agent-task-completed-menu-${task.id}`"
                :aria-label="t('shared.moreActions')"
                @click="toggleMenu(task.id)"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <circle cx="4" cy="10" r="1.5" fill="currentColor" />
                  <circle cx="10" cy="10" r="1.5" fill="currentColor" />
                  <circle cx="16" cy="10" r="1.5" fill="currentColor" />
                </svg>
              </button>
              <div
                v-if="openMenuTaskId === task.id"
                class="agent-task-panel__menu"
                :data-testid="`agent-task-menu-panel-${task.id}`"
              >
                <button type="button" :data-testid="`agent-task-delete-completed-${task.id}`" @click="deleteTaskFromMenu(task.id)">{{ t('shared.deleteTask') }}</button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { IContextProvider, Task, TaskPriority } from '@packages/core/src';
import { useWorkspaceI18n } from '../i18n';
import TaskEditorInline from './TaskEditorInline.vue';

const props = defineProps<{
  activeAgentKey?: string | null;
  activePath?: string | null;
  selectedNodePath?: string | null;
  activeDocument?: { path: string } | null;
  contextProvider?: IContextProvider | null;
}>();

const { t } = useWorkspaceI18n();
const loading = ref(false);
const error = ref<string | null>(null);
const tasks = ref<Task[]>([]);
const editingTask = ref<Task | null>(null);
const completedCollapsed = ref(true);
const openMenuTaskId = ref<string | null>(null);

const activeDocumentPath = computed(() => props.activeDocument?.path?.trim() || '');
const activeAgentKey = computed(() => props.activeAgentKey?.trim() || '');
const scope = computed(() => {
  if (activeDocumentPath.value) {
    return {
      documentPath: activeDocumentPath.value,
      agentKey: activeAgentKey.value || null
    };
  }

  if (activeAgentKey.value) {
    return {
      documentPath: null,
      agentKey: activeAgentKey.value
    };
  }

  return null;
});

const editingTaskId = computed(() => editingTask.value?.id ?? null);
const openTasks = computed(() => tasks.value.filter((task) => !task.completed));
const completedTasks = computed(() => tasks.value.filter((task) => task.completed));
const visibleOpenTasks = computed(() => openTasks.value.filter((task) => task.id !== editingTaskId.value));
const visibleCompletedTasks = computed(() => completedTasks.value.filter((task) => task.id !== editingTaskId.value));

watch(
  () => [props.contextProvider ?? null, activeDocumentPath.value, activeAgentKey.value, props.selectedNodePath ?? null, props.activePath ?? null] as const,
  () => {
    void loadTasks();
  },
  { immediate: true }
);

async function loadTasks(): Promise<void> {
  const provider = props.contextProvider;
  const resolvedScope = scope.value;
  if (!provider || !resolvedScope) {
    tasks.value = [];
    error.value = null;
    return;
  }

  loading.value = true;
  error.value = null;
  try {
    const taskProvider = provider.getTaskProvider();
    const [open, completed] = await Promise.all([
      taskProvider.getTasks(resolvedScope.documentPath, resolvedScope.agentKey, false),
      taskProvider.getTasks(resolvedScope.documentPath, resolvedScope.agentKey, true)
    ]);
    tasks.value = [...open, ...completed];
  } catch (loadError) {
    tasks.value = [];
    error.value = loadError instanceof Error ? loadError.message : t('shared.loadingTasksFailed');
  } finally {
    loading.value = false;
  }
}

function createDraftTask(): Task | null {
  const resolvedScope = scope.value;
  if (!resolvedScope) {
    return null;
  }

  return {
    id: 'draft-task',
    title: '',
    notes: '',
    completed: false,
    dueAt: null,
    priority: null,
    documentPath: resolvedScope.documentPath,
    agentKey: resolvedScope.agentKey,
    createdAt: 0,
    updatedAt: 0,
    completedAt: null,
    calendarProviderId: null,
    calendarEventId: null,
    calendarSyncStatus: null,
    calendarLastSyncedAt: null,
    calendarLastSyncError: null
  };
}

function startCreateTask(): void {
  editingTask.value = createDraftTask();
}

function startEditTask(task: Task): void {
  editingTask.value = { ...task };
}

function startEditTaskFromRow(task: Task): void {
  openMenuTaskId.value = null;
  startEditTask(task);
}

function openEditFromMenu(task: Task): void {
  openMenuTaskId.value = null;
  startEditTask(task);
}

function cancelEdit(): void {
  editingTask.value = null;
}

async function saveTask(task: Task): Promise<void> {
  const provider = props.contextProvider;
  if (!provider) {
    return;
  }

  const taskProvider = provider.getTaskProvider();
  if (task.id === 'draft-task') {
    await taskProvider.createTask(task);
  } else {
    await taskProvider.updateTask(task);
  }

  editingTask.value = null;
  await loadTasks();
}

async function deleteTask(taskId: string): Promise<void> {
  const provider = props.contextProvider;
  if (!provider) {
    return;
  }

  openMenuTaskId.value = null;
  await provider.getTaskProvider().deleteTask(taskId);
  await loadTasks();
}

async function deleteTaskFromMenu(taskId: string): Promise<void> {
  await deleteTask(taskId);
}

async function toggleTask(task: Task, completed: boolean): Promise<void> {
  const provider = props.contextProvider;
  if (!provider) {
    return;
  }

  await provider.getTaskProvider().setTaskCompleted(task.id, completed);
  await loadTasks();
}

function toggleMenu(taskId: string): void {
  openMenuTaskId.value = openMenuTaskId.value === taskId ? null : taskId;
}

function formatPriority(priority: TaskPriority): string {
  if (priority === 'high') return t('shared.taskPriorityHigh');
  if (priority === 'medium') return t('shared.taskPriorityMedium');
  return t('shared.taskPriorityLow');
}

function formatDueAt(value: number): string {
  const dueDate = new Date(value);
  const month = String(dueDate.getMonth() + 1).padStart(2, '0');
  const day = String(dueDate.getDate()).padStart(2, '0');
  const dateLabel = `${month}/${day}`;
  if (dueDate.getHours() === 0 && dueDate.getMinutes() === 0) {
    return dateLabel;
  }

  const hours = String(dueDate.getHours()).padStart(2, '0');
  const minutes = String(dueDate.getMinutes()).padStart(2, '0');
  return `${dateLabel} ${hours}:${minutes}`;
}
</script>

<style scoped>
.agent-task-panel {
  display: grid;
  gap: 14px;
  padding: 14px;
  color: rgba(226, 232, 240, 0.96);
}

.agent-task-panel__actions {
  display: flex;
  justify-content: flex-start;
}

.agent-task-panel__add,
.agent-task-panel__completed-toggle,
.agent-task-panel__row-actions button {
  border: 0;
  cursor: pointer;
}

.agent-task-panel__add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 8px;
  background: transparent;
  color: rgba(226, 232, 240, 0.86);
}

.agent-task-panel__add:hover,
.agent-task-panel__add:focus-visible {
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
}

.agent-task-panel__add svg {
  width: 18px;
  height: 18px;
}

.agent-task-panel__list {
  display: grid;
  gap: 10px;
}

.agent-task-panel__item {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.agent-task-panel__item--with-meta {
  padding-bottom: 30px;
}

.agent-task-panel__item--completed {
  opacity: 0.72;
  border-color: transparent;
}

.agent-task-panel__check input {
  margin-top: 4px;
}

.agent-task-panel__content {
  position: relative;
  min-width: 0;
}

.agent-task-panel__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.agent-task-panel__title-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.agent-task-panel__sync-status {
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.55);
}

.agent-task-panel__sync-status--synced {
  background: #22c55e;
}

.agent-task-panel__sync-status--failed {
  background: #ef4444;
}

.agent-task-panel__notes,
.agent-task-panel__meta,
.agent-task-panel__message {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(191, 219, 254, 0.78);
}

.agent-task-panel__notes {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-task-panel__meta {
  position: absolute;
  inset-inline-end: 12px;
  bottom: 10px;
  margin: 0;
  text-align: right;
}

.agent-task-panel__message--error {
  color: #fda4af;
}

.agent-task-panel__priority[data-priority='high'] {
  color: #fb7185;
}

.agent-task-panel__priority[data-priority='medium'] {
  color: #f59e0b;
}

.agent-task-panel__priority[data-priority='low'] {
  color: #2dd4bf;
}

.agent-task-panel__row-actions {
  position: relative;
  display: flex;
  align-items: flex-start;
}

.agent-task-panel__row-actions button,
.agent-task-panel__completed-toggle {
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(30, 41, 59, 0.9);
  color: rgba(226, 232, 240, 0.92);
}

.agent-task-panel__completed-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-radius: 0;
  background: transparent;
  color: rgba(226, 232, 240, 0.88);
}

.agent-task-panel__completed-toggle:hover,
.agent-task-panel__completed-toggle:focus-visible {
  color: #f8fafc;
}

.agent-task-panel__completed-chevron {
  width: 16px;
  height: 16px;
  color: rgba(148, 163, 184, 0.9);
  transition: transform 120ms ease;
}

.agent-task-panel__completed-chevron--expanded {
  transform: rotate(180deg);
}

.agent-task-panel__menu-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 8px !important;
  background: transparent !important;
  color: rgba(226, 232, 240, 0.78) !important;
}

.agent-task-panel__menu-trigger:hover,
.agent-task-panel__menu-trigger:focus-visible {
  background: rgba(255, 255, 255, 0.06) !important;
  color: #f8fafc !important;
}

.agent-task-panel__menu-trigger svg {
  width: 16px;
  height: 16px;
}

.agent-task-panel__menu {
  position: absolute;
  top: 34px;
  right: 0;
  z-index: 2;
  display: grid;
  gap: 4px;
  min-width: 96px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 10px 28px rgba(2, 6, 23, 0.42);
}

.agent-task-panel__menu button {
  border-radius: 8px;
  text-align: left;
}
</style>
