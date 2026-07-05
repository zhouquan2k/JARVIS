<template>
  <section ref="panelRoot" class="task-list-panel" data-testid="task-list-panel">
    <div class="task-list-panel__actions">
      <button
        v-if="canCreateTask"
        type="button"
        class="task-list-panel__add"
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
    <p v-if="loading" class="task-list-panel__message" data-testid="agent-task-loading">
      {{ t('shared.loadingTasks') }}
    </p>
    <p v-else-if="error" class="task-list-panel__message task-list-panel__message--error" data-testid="agent-task-error">
      {{ error }}
    </p>

    <template v-else-if="completedOnly">
      <div class="task-list-panel__list" data-testid="agent-task-completed-list">
        <article
          v-for="task in visibleCompletedTasks"
          :key="task.id"
          class="task-list-panel__item task-list-panel__item--completed"
          :class="{ 'task-list-panel__item--with-meta': Boolean(task.dueAt) }"
          :data-testid="`agent-task-item-${task.id}`"
        >
          <TaskListRow
            :task="task"
            :show-priority="false"
            :show-edit="false"
            :open-menu-task-id="openMenuTaskId"
            :is-navigable="isGlobalAllTasksView"
            @toggle-completed="toggleTask"
            @delete-task="deleteTaskFromMenu"
            @toggle-menu="toggleMenu"
            @open-task="openTaskNode"
          />
        </article>
        <p v-if="visibleCompletedTasks.length === 0" class="task-list-panel__message" data-testid="agent-task-empty">
          {{ t('shared.noTasks') }}
        </p>
      </div>
    </template>

    <template v-else>
      <div class="task-list-panel__list" data-testid="agent-task-open-list">
        <article
          v-if="draftTask"
          class="task-list-panel__item task-list-panel__item--editing"
          data-testid="agent-task-item-draft-task"
        >
          <TaskEditorInline
            :task="draftTask"
            @save="saveTask"
            @cancel="cancelEdit"
          />
        </article>
        <template v-if="groupByDate && openTaskGroups.length > 0">
          <section
            v-for="group in openTaskGroups"
            :key="group.dateKey"
            class="task-list-panel__group"
            :data-testid="`task-group-${group.dateKey}`"
          >
            <header class="task-list-panel__group-title" :data-testid="`task-group-title-${group.dateKey}`">
              {{ group.label }}
            </header>
            <article
              v-for="task in group.tasks"
              :key="task.id"
              class="task-list-panel__item"
              :class="taskRowClass(task)"
              :data-testid="`agent-task-item-${task.id}`"
            >
              <TaskEditorInline
                v-if="editingTaskId === task.id"
                :task="editingTask!"
                @save="saveTask"
                @cancel="cancelEdit"
              />
              <TaskListRow
                v-else
                :task="task"
                :show-priority="true"
                :show-edit="true"
                :open-menu-task-id="openMenuTaskId"
                :is-navigable="isGlobalAllTasksView"
                @toggle-completed="toggleTask"
                @start-edit="startEditTaskFromRow"
                @open-edit="openEditFromMenu"
                @delete-task="deleteTaskFromMenu"
                @toggle-menu="toggleMenu"
                @open-task="openTaskNode"
              />
            </article>
          </section>
        </template>

        <template v-else-if="includeTomorrow">
          <article
            v-for="task in visibleOpenTasks"
            :key="task.id"
            class="task-list-panel__item"
            :class="taskRowClass(task)"
            :data-testid="`agent-task-item-${task.id}`"
          >
            <TaskEditorInline
              v-if="editingTaskId === task.id"
              :task="editingTask!"
              @save="saveTask"
              @cancel="cancelEdit"
            />
            <TaskListRow
              v-else
              :task="task"
              :show-priority="true"
              :show-edit="true"
              :open-menu-task-id="openMenuTaskId"
              :is-navigable="isGlobalAllTasksView"
              @toggle-completed="toggleTask"
              @start-edit="startEditTaskFromRow"
              @open-edit="openEditFromMenu"
              @delete-task="deleteTaskFromMenu"
              @toggle-menu="toggleMenu"
              @open-task="openTaskNode"
            />
          </article>
          <p v-if="visibleOpenTasks.length === 0" class="task-list-panel__message" data-testid="agent-task-today-empty">
            {{ t('shared.noTasks') }}
          </p>

          <section
            v-if="visibleTomorrowTasks.length > 0"
            class="task-list-panel__group task-list-panel__group--tomorrow"
            data-testid="task-group-tomorrow"
          >
            <h2 class="task-list-panel__tomorrow-heading" data-testid="task-group-title-tomorrow">
              {{ t('shared.tomorrow') }}
            </h2>
            <article
              v-for="task in visibleTomorrowTasks"
              :key="task.id"
              class="task-list-panel__item"
              :class="taskRowClass(task)"
              :data-testid="`agent-task-item-${task.id}`"
            >
              <TaskEditorInline
                v-if="editingTaskId === task.id"
                :task="editingTask!"
                @save="saveTask"
                @cancel="cancelEdit"
              />
              <TaskListRow
                v-else
                :task="task"
                :show-priority="true"
                :show-edit="true"
                :open-menu-task-id="openMenuTaskId"
                :is-navigable="isGlobalAllTasksView"
                @toggle-completed="toggleTask"
                @start-edit="startEditTaskFromRow"
                @open-edit="openEditFromMenu"
                @delete-task="deleteTaskFromMenu"
                @toggle-menu="toggleMenu"
                @open-task="openTaskNode"
              />
            </article>
          </section>
        </template>

        <template v-else>
          <article
            v-for="task in visibleOpenTasks"
            :key="task.id"
            class="task-list-panel__item"
            :class="taskRowClass(task)"
            :data-testid="`agent-task-item-${task.id}`"
          >
            <TaskEditorInline
              v-if="editingTaskId === task.id"
              :task="editingTask!"
              @save="saveTask"
              @cancel="cancelEdit"
            />
            <TaskListRow
              v-else
              :task="task"
              :show-priority="true"
              :show-edit="true"
              :open-menu-task-id="openMenuTaskId"
              :is-navigable="isGlobalAllTasksView"
              @toggle-completed="toggleTask"
              @start-edit="startEditTaskFromRow"
              @open-edit="openEditFromMenu"
              @delete-task="deleteTaskFromMenu"
              @toggle-menu="toggleMenu"
              @open-task="openTaskNode"
            />
          </article>
        </template>

        <p v-if="visibleOpenTasks.length === 0 && !includeTomorrow" class="task-list-panel__message" data-testid="agent-task-empty">
          {{ t('shared.noTasks') }}
        </p>
      </div>

      <section v-if="showCompletedSection" class="task-list-panel__completed">
        <button
          type="button"
          class="task-list-panel__completed-toggle"
          data-testid="agent-task-completed-toggle"
          :aria-expanded="!completedCollapsed"
          @click="completedCollapsed = !completedCollapsed"
        >
          <span>{{ t('shared.completedTasks', { count: completedTasks.length }) }}</span>
          <svg
            class="task-list-panel__completed-chevron"
            :class="{ 'task-list-panel__completed-chevron--expanded': !completedCollapsed }"
            viewBox="0 0 20 20"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m6 8 4 4 4-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" />
          </svg>
        </button>
        <div v-if="!completedCollapsed" class="task-list-panel__list" data-testid="agent-task-completed-list">
          <article
            v-for="task in visibleCompletedTasks"
            :key="task.id"
            class="task-list-panel__item task-list-panel__item--completed"
            :class="{ 'task-list-panel__item--with-meta': Boolean(task.dueAt) }"
          >
            <TaskListRow
              :task="task"
              :show-priority="false"
              :show-edit="false"
              :open-menu-task-id="openMenuTaskId"
              @toggle-completed="toggleTask"
              @delete-task="deleteTaskFromMenu"
              @toggle-menu="toggleMenu"
            />
          </article>
        </div>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { Fragment, computed, defineComponent, h, inject, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue';
import type { Task, TaskExecutionState, TaskPriority, TaskQueryTag } from '../../api';
import { useWorkspaceI18n, workspaceNavigationApiKey } from '@packages/ui';
import TaskEditorInline from './TaskEditorInline.vue';
import { getTaskService } from '../taskServiceRegistry';

type TaskDateGroup = {
  dateKey: string;
  label: string;
  tasks: Task[];
};

const TaskListRow = defineComponent({
  name: 'TaskListRow',
  props: {
    task: {
      type: Object as () => Task,
      required: true
    },
    showPriority: {
      type: Boolean,
      required: true
    },
    showEdit: {
      type: Boolean,
      required: true
    },
    openMenuTaskId: {
      type: String as PropType<string | null>,
      default: null
    },
    isNavigable: {
      type: Boolean,
      default: false
    }
  },
  emits: ['toggle-completed', 'start-edit', 'open-edit', 'delete-task', 'toggle-menu', 'open-task'],
  setup(rowProps, { emit }) {
    const { t } = useWorkspaceI18n();

    return () => h(Fragment, [
      h('label', { class: 'task-list-panel__check' }, [
        h('input', {
          type: 'checkbox',
          checked: rowProps.task.completed,
          'data-testid': rowProps.task.completed ? `agent-task-reopen-${rowProps.task.id}` : `agent-task-complete-${rowProps.task.id}`,
          onChange: () => emit('toggle-completed', rowProps.task, !rowProps.task.completed)
        }),
        h('span')
      ]),
      h('div', {
        class: 'task-list-panel__content',
        'data-testid': `agent-task-content-${rowProps.task.id}`,
        onClick: rowProps.isNavigable ? () => emit('open-task', rowProps.task) : undefined,
        onDblclick: rowProps.task.completed ? undefined : () => emit('start-edit', rowProps.task)
      }, [
        h('div', { class: 'task-list-panel__title-row' }, [
          h('div', { class: 'task-list-panel__title-main' }, [
            rowProps.task.calendarSyncStatus
              ? h('span', {
                class: ['task-list-panel__sync-status', `task-list-panel__sync-status--${rowProps.task.calendarSyncStatus}`],
                'data-testid': `agent-task-sync-status-${rowProps.task.id}`,
                'aria-hidden': 'true'
              })
              : null,
            h('strong', rowProps.task.title)
          ]),
          rowProps.showPriority && rowProps.task.priority
            ? h('span', { class: 'task-list-panel__priority', 'data-priority': rowProps.task.priority }, formatPriority(rowProps.task.priority, t))
            : null
        ]),
        rowProps.task.notes ? h('p', { class: 'task-list-panel__notes' }, formatTaskNotesPreview(rowProps.task.notes)) : null
      ]),
      h('div', { class: 'task-list-panel__footer' }, [
        rowProps.task.executionState
          ? h('div', {
            class: 'task-list-panel__execution-meta',
            'data-testid': `agent-task-execution-meta-${rowProps.task.id}`
          }, [
            h('span', {
              class: ['task-list-panel__execution-chip', `task-list-panel__execution-chip--${rowProps.task.executionState}`],
              'data-testid': `agent-task-execution-chip-${rowProps.task.id}`
            }, formatExecutionState(rowProps.task.executionState, t))
          ])
          : null,
        buildTaskScopeMeta(rowProps.task).length > 0
          ? h('div', {
            class: 'task-list-panel__scope-meta task-list-panel__scope-meta--footer',
            'data-testid': `agent-task-scope-meta-footer-${rowProps.task.id}`
          }, buildTaskScopeMeta(rowProps.task).map((item) => h('span', {
            key: item.key,
            class: 'task-list-panel__scope-chip',
            'data-testid': `agent-task-scope-footer-${item.key}-${rowProps.task.id}`
          }, item.label)))
          : null,
        rowProps.task.recurrence
          ? h('span', {
            class: 'task-list-panel__recurrence-chip',
            'data-testid': `agent-task-recurrence-${rowProps.task.id}`
          }, formatRecurrence(rowProps.task.recurrence, t))
          : null,
        rowProps.task.dueAt ? h('p', {
          class: [
            'task-list-panel__meta',
            isTaskOverdue(rowProps.task) ? 'task-list-panel__meta--overdue' : null
          ],
          'data-testid': `agent-task-due-at-${rowProps.task.id}`
        }, formatDueAt(rowProps.task.dueAt)) : null
      ].filter(Boolean)),
      h('div', { class: 'task-list-panel__row-actions' }, [
        h('button', {
          type: 'button',
          class: 'task-list-panel__menu-trigger',
          'data-testid': rowProps.task.completed ? `agent-task-completed-menu-${rowProps.task.id}` : `agent-task-menu-${rowProps.task.id}`,
          'aria-label': t('shared.moreActions'),
          onClick: () => emit('toggle-menu', rowProps.task.id)
        }, [
          h('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' }, [
            h('circle', { cx: '4', cy: '10', r: '1.5', fill: 'currentColor' }),
            h('circle', { cx: '10', cy: '10', r: '1.5', fill: 'currentColor' }),
            h('circle', { cx: '16', cy: '10', r: '1.5', fill: 'currentColor' })
          ])
        ]),
        rowProps.openMenuTaskId === rowProps.task.id
          ? h('div', {
            class: 'task-list-panel__menu',
            'data-testid': `agent-task-menu-panel-${rowProps.task.id}`
          }, [
            rowProps.showEdit
              ? h('button', {
                type: 'button',
                'data-testid': `agent-task-edit-${rowProps.task.id}`,
                onClick: () => emit('open-edit', rowProps.task)
              }, t('shared.editTask'))
              : null,
            h('button', {
              type: 'button',
              'data-testid': rowProps.task.completed ? `agent-task-delete-completed-${rowProps.task.id}` : `agent-task-delete-${rowProps.task.id}`,
              onClick: () => emit('delete-task', rowProps.task.id)
            }, t('shared.deleteTask'))
          ].filter(Boolean))
          : null
      ])
    ]);
  }
});

const props = withDefaults(defineProps<{
  documentPath?: string | null;
  documentId?: string | null;
  agentKey?: string | null;
  tag?: TaskQueryTag | null;
  groupByDate?: boolean;
  detailKey?: string | null;
  includeTomorrow?: boolean;
  showCompletedSection?: boolean;
  completedOnly?: boolean;
}>(), {
  documentPath: null,
  documentId: null,
  agentKey: null,
  tag: 'all',
  groupByDate: false,
  detailKey: null,
  includeTomorrow: false,
  showCompletedSection: true,
  completedOnly: false
});

const { t } = useWorkspaceI18n();
const loading = ref(false);
const error = ref<string | null>(null);
const tasks = ref<Task[]>([]);
const tomorrowOpenTasks = ref<Task[]>([]);
const editingTask = ref<Task | null>(null);
const completedCollapsed = ref(true);
const openMenuTaskId = ref<string | null>(null);
const panelRoot = ref<HTMLElement | null>(null);
const workspaceNavigationApi = inject(workspaceNavigationApiKey, null);
const consumedDetailKey = ref<string | null>(null);

const normalizedDocumentPath = computed(() => normalizeScopeValue(props.documentPath));
const normalizedAgentKey = computed(() => normalizeScopeValue(props.agentKey));
const editingTaskId = computed(() => editingTask.value?.id ?? null);
const draftTask = computed(() => editingTask.value?.id === 'draft-task' ? editingTask.value : null);
const isGlobalAllTasksView = computed(() => normalizedDocumentPath.value === null && normalizedAgentKey.value === null);
const openTasks = computed(() => sortTasks(tasks.value.filter((task) => !task.completed)));
const completedTasks = computed(() => sortTasks(tasks.value.filter((task) => task.completed)));

defineExpose({ openTaskCount: computed(() => openTasks.value.length) });
const visibleOpenTasks = computed(() => openTasks.value);
const visibleCompletedTasks = computed(() => completedTasks.value);
const visibleTomorrowTasks = computed(() => sortTasks(tomorrowOpenTasks.value));
const canCreateTask = computed(() => !props.completedOnly);
const openTaskGroups = computed(() => props.groupByDate ? buildDateGroups(visibleOpenTasks.value) : []);

watch(
  () => [normalizedDocumentPath.value, props.documentId ?? null, normalizedAgentKey.value, props.tag ?? 'all'] as const,
  () => {
    void loadTasks();
  },
  { immediate: true }
);

watch(
  () => props.detailKey ?? null,
  (detailKey) => {
    if (!detailKey) {
      consumedDetailKey.value = null;
    }
  },
  { immediate: true }
);

watch(
  () => [props.detailKey ?? null, tasks.value] as const,
  ([detailKey, currentTasks]) => {
    if (!detailKey || consumedDetailKey.value === detailKey) {
      return;
    }

    const matchedTask = currentTasks.find((task) => task.id === detailKey);
    if (!matchedTask || matchedTask.completed) {
      return;
    }

    consumedDetailKey.value = detailKey;
    startEditTask(matchedTask);
  },
  { immediate: true }
);

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
});

async function loadTasks(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const taskProvider = getTaskService();
    if (props.completedOnly) {
      tasks.value = await taskProvider.getTasks(normalizedDocumentPath.value, normalizedAgentKey.value, true, props.tag, props.documentId);
      tomorrowOpenTasks.value = [];
    } else {
      const [open, completed, tomorrow] = await Promise.all([
        taskProvider.getTasks(normalizedDocumentPath.value, normalizedAgentKey.value, false, props.tag, props.documentId),
        taskProvider.getTasks(normalizedDocumentPath.value, normalizedAgentKey.value, true, props.tag, props.documentId),
        props.includeTomorrow
          ? taskProvider.getTasks(normalizedDocumentPath.value, normalizedAgentKey.value, false, 'tomorrow', props.documentId)
          : Promise.resolve([] as Task[])
      ]);
      tasks.value = [...open, ...completed];
      tomorrowOpenTasks.value = tomorrow;
    }
  } catch (loadError) {
    tasks.value = [];
    tomorrowOpenTasks.value = [];
    error.value = loadError instanceof Error ? loadError.message : t('shared.loadingTasksFailed');
  } finally {
    loading.value = false;
  }
}

function createDraftTask(): Task {
  const dueAt = isGlobalAllTasksView.value && props.tag === 'today'
    ? new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 0, 0, 0, 0).getTime()
    : null;
  return {
    id: 'draft-task',
    title: '',
    notes: '',
    completed: false,
    dueAt,
    priority: null,
    executionState: null,
    documentPath: normalizedDocumentPath.value,
    documentId: props.documentId ?? null,
    agentKey: normalizedAgentKey.value,
    createdAt: 0,
    updatedAt: 0,
    completedAt: null,
    calendarProviderId: null,
    calendarEventId: null,
    calendarSyncStatus: null,
    calendarLastSyncedAt: null,
    calendarLastSyncError: null,
    recurrence: null
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

async function openEditFromMenu(task: Task): Promise<void> {
  openMenuTaskId.value = null;
  startEditTask(task);
}

function cancelEdit(): void {
  editingTask.value = null;
}

async function saveTask(task: Task): Promise<void> {
  const taskProvider = getTaskService();
  if (task.id === 'draft-task') {
    await taskProvider.createTask(task);
  } else {
    await taskProvider.updateTask(task);
  }

  editingTask.value = null;
  await loadTasks();
}

async function deleteTaskFromMenu(taskId: string): Promise<void> {
  openMenuTaskId.value = null;
  await getTaskService().deleteTask(taskId);
  await loadTasks();
}

async function toggleTask(task: Task, completed: boolean): Promise<void> {
  await getTaskService().setTaskCompleted(task.id, completed);
  await loadTasks();
}

async function openTaskNode(task: Task): Promise<void> {
  if (!isGlobalAllTasksView.value || !workspaceNavigationApi) {
    return;
  }

  const targetPath = task.documentPath ?? agentKeyToNodePath(task.agentKey);
  if (!targetPath) {
    return;
  }

  await workspaceNavigationApi.openNode(targetPath, {
    tab: 'tasks',
    detailKey: task.id
  });
}

function toggleMenu(taskId: string): void {
  openMenuTaskId.value = openMenuTaskId.value === taskId ? null : taskId;
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!openMenuTaskId.value) {
    return;
  }

  const root = panelRoot.value;
  const target = event.target;
  if (!(target instanceof Node) || !root) {
    openMenuTaskId.value = null;
    return;
  }

  const clickedInsidePanel = root.contains(target);
  if (!clickedInsidePanel) {
    openMenuTaskId.value = null;
    return;
  }

  const clickedInsideMenu = target instanceof Element && target.closest('.task-list-panel__menu, .task-list-panel__menu-trigger');
  if (!clickedInsideMenu) {
    openMenuTaskId.value = null;
  }
}

function normalizeScopeValue(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function agentKeyToNodePath(agentKey?: string | null): string | null {
  const trimmed = agentKey?.trim();
  if (!trimmed) return null;
  if (trimmed === '/') return '/';
  return trimmed.replace(/\/+$/, '');
}

function buildDateGroups(sourceTasks: Task[]): TaskDateGroup[] {
  const groups = new Map<string, TaskDateGroup>();
  const sortedTasks = sortTasks(sourceTasks);

  for (const task of sortedTasks) {
    const key = getDateKey(task.dueAt);
    const existing = groups.get(key);
    if (existing) {
      existing.tasks.push(task);
      continue;
    }

    groups.set(key, {
      dateKey: key,
      label: formatTaskGroupLabel(key),
      tasks: [task]
    });
  }

  return [...groups.values()];
}

function sortTasks(sourceTasks: Task[]): Task[] {
  return [...sourceTasks].sort((left, right) => {
    const executionOrder = compareExecutionState(left, right);
    if (executionOrder !== 0) {
      return executionOrder;
    }

    const leftHasDueAt = left.dueAt !== null;
    const rightHasDueAt = right.dueAt !== null;

    if (leftHasDueAt && rightHasDueAt) {
      if (left.dueAt !== right.dueAt) {
        return left.dueAt! - right.dueAt!;
      }
      return right.updatedAt - left.updatedAt;
    }

    if (leftHasDueAt !== rightHasDueAt) {
      return leftHasDueAt ? -1 : 1;
    }

    return right.updatedAt - left.updatedAt;
  });
}

function compareExecutionState(left: Task, right: Task): number {
  const leftRank = getExecutionStateRank(left.executionState);
  const rightRank = getExecutionStateRank(right.executionState);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return 0;
}

function getExecutionStateRank(value: TaskExecutionState): number {
  if (value === 'morning') return 0;
  if (value === 'doing') return 1;
  if (value === 'afternoon') return 2;
  if (value === 'evening') return 3;
  return 4;
}

function getDateKey(dueAt: number | null): string {
  if (dueAt === null) {
    return 'unscheduled';
  }

  const dueDate = new Date(dueAt);
  const year = dueDate.getFullYear();
  const month = String(dueDate.getMonth() + 1).padStart(2, '0');
  const day = String(dueDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTaskGroupLabel(dateKey: string): string {
  if (dateKey === 'unscheduled') {
    return t('shared.noTasks');
  }

  const [year, month, day] = dateKey.split('-').map((value) => Number(value));
  const currentDate = new Date();
  const targetDate = new Date(year, month - 1, day);
  const isToday = targetDate.getFullYear() === currentDate.getFullYear()
    && targetDate.getMonth() === currentDate.getMonth()
    && targetDate.getDate() === currentDate.getDate();

  if (isToday) {
    return `${t('shared.today')} · ${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  }

  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
}

function formatPriority(priority: TaskPriority, translate: ReturnType<typeof useWorkspaceI18n>['t']): string {
  if (priority === 'high') return translate('shared.taskPriorityHigh');
  if (priority === 'medium') return translate('shared.taskPriorityMedium');
  return translate('shared.taskPriorityLow');
}

function formatExecutionState(value: Exclude<TaskExecutionState, null>, translate: ReturnType<typeof useWorkspaceI18n>['t']): string {
  if (value === 'doing') return translate('shared.taskExecutionStateDoing');
  if (value === 'morning') return translate('shared.taskExecutionStateMorning');
  if (value === 'afternoon') return translate('shared.taskExecutionStateAfternoon');
  return translate('shared.taskExecutionStateEvening');
}

function formatRecurrence(value: NonNullable<Task['recurrence']>, translate: ReturnType<typeof useWorkspaceI18n>['t']): string {
  if (value === 'daily') return `↻ ${translate('shared.taskRecurrenceDaily')}`;
  if (value === 'weekly') return `↻ ${translate('shared.taskRecurrenceWeekly')}`;
  return `↻ ${translate('shared.taskRecurrenceMonthly')}`;
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

function isTaskOverdue(task: Task): boolean {
  return !task.completed && task.dueAt !== null && task.dueAt < Date.now();
}

function formatTaskNotesPreview(notes: string): string {
  return notes.split(/\r?\n/, 1)[0] ?? '';
}

function buildTaskScopeMeta(task: Task): Array<{ key: string; label: string }> {
  const items: Array<{ key: string; label: string }> = [];
  if (task.documentPath) {
    items.push({
      key: 'document',
      label: formatTaskDocumentLabel(task.documentPath)
    });
  }
  if (task.agentKey) {
    items.push({
      key: 'agent',
      label: formatTaskAgentLabel(task.agentKey)
    });
  }
  return items;
}

function formatTaskDocumentLabel(documentPath: string): string {
  const normalized = documentPath.trim();
  if (!normalized) {
    return '';
  }

  const segments = normalized.split('/').filter(Boolean);
  const fileName = segments[segments.length - 1] ?? normalized;
  return fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;
}

function formatTaskAgentLabel(agentKey: string): string {
  const normalized = agentKey.trim().replace(/\/+$/, '');
  if (!normalized) {
    return '';
  }

  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

function taskRowClass(task: Task): Record<string, boolean> {
  return {
    'task-list-panel__item--with-meta': Boolean(task.dueAt),
    'task-list-panel__item--editing': editingTaskId.value === task.id,
    'task-list-panel__item--active-detail': props.detailKey === task.id,
    'task-list-panel__item--navigable': isGlobalAllTasksView.value
  };
}
</script>

<style scoped>
.task-list-panel {
  display: grid;
  gap: 14px;
  color: rgba(226, 232, 240, 0.96);
}

.task-list-panel__actions {
  display: flex;
  justify-content: flex-start;
}

.task-list-panel__add,
.task-list-panel__completed-toggle,
.task-list-panel__row-actions button {
  border: 0;
  cursor: pointer;
}

.task-list-panel__add {
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

.task-list-panel__add:hover,
.task-list-panel__add:focus-visible {
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
}

.task-list-panel__add svg {
  width: 18px;
  height: 18px;
}

.task-list-panel__list,
.task-list-panel__group {
  display: grid;
  gap: 10px;
}

.task-list-panel__group + .task-list-panel__group {
  margin-top: 6px;
}

.task-list-panel__item--active-detail {
  border-radius: 16px;
  background: rgba(56, 189, 248, 0.08);
}

.task-list-panel__item.task-list-panel__item--editing {
  display: block;
  grid-template-columns: none;
  row-gap: 0;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  justify-self: stretch;
}


.task-list-panel__group-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(191, 219, 254, 0.74);
}

.task-list-panel__group--tomorrow {
  margin-top: 28px;
}

.task-list-panel__tomorrow-heading {
  margin: 0 0 14px;
  font-size: 24px;
  font-weight: 700;
  color: #f8fafc;
}

.task-list-panel__item {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  column-gap: 12px;
  row-gap: 4px;
  align-items: start;
  padding: 12px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.task-list-panel__item--with-meta {
  padding-bottom: 10px;
}

.task-list-panel__item--completed {
  opacity: 0.72;
  border-color: transparent;
}

:deep(.task-list-panel__check) input {
  margin-top: 4px;
}

:deep(.task-list-panel__content) {
  grid-column: 2;
  grid-row: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  width: 100%;
}

:deep(.task-list-panel__title-row) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

:deep(.task-list-panel__title-main) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

:deep(.task-list-panel__sync-status) {
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.55);
}

:deep(.task-list-panel__sync-status--synced) {
  background: #22c55e;
}

:deep(.task-list-panel__sync-status--failed) {
  background: #ef4444;
}

.task-list-panel__meta,
.task-list-panel__message {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(191, 219, 254, 0.78);
}

:deep(.task-list-panel__footer) {
  grid-column: 2 / 4;
  grid-row: 2;
  justify-self: stretch;
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 0;
  min-width: 0;
  width: 100%;
}

:deep(.task-list-panel__notes) {
  margin: 2px 0 0;
  font-size: 13px;
  font-weight: 100;
  color: rgba(191, 219, 254, 0.78);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.task-list-panel__scope-meta) {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  flex: 0 1 auto;
}

:deep(.task-list-panel__scope-meta--footer) {
  margin-top: 0;
}

:deep(.task-list-panel__scope-chip) {
  font-size: 11px;
  line-height: 1.2;
  color: rgba(148, 163, 184, 0.78);
}

:deep(.task-list-panel__execution-meta) {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}

:deep(.task-list-panel__execution-chip) {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

:deep(.task-list-panel__execution-chip--doing) {
  color: #dcfce7;
  background: rgba(34, 197, 94, 0.28);
  box-shadow: inset 0 0 0 1px rgba(74, 222, 128, 0.2);
}

:deep(.task-list-panel__execution-chip--morning) {
  color: #fef3c7;
  background: rgba(245, 158, 11, 0.24);
  box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.18);
}

:deep(.task-list-panel__execution-chip--afternoon) {
  color: #ffedd5;
  background: rgba(249, 115, 22, 0.26);
  box-shadow: inset 0 0 0 1px rgba(251, 146, 60, 0.18);
}

:deep(.task-list-panel__execution-chip--evening) {
  color: #dbeafe;
  background: rgba(59, 130, 246, 0.24);
  box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.18);
}

:deep(.task-list-panel__scope-chip + .task-list-panel__scope-chip)::before {
  content: '·';
  margin-right: 6px;
  color: rgba(100, 116, 139, 0.72);
}

:deep(.task-list-panel__recurrence-chip) {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  color: #e9d5ff;
  background: rgba(139, 92, 246, 0.22);
  box-shadow: inset 0 0 0 1px rgba(167, 139, 250, 0.18);
}

:deep(.task-list-panel__meta) {
  margin: 0;
  text-align: right;
  flex: 0 0 auto;
  white-space: nowrap;
}

:deep(.task-list-panel__meta--overdue) {
  color: #f87171;
}

.task-list-panel__message--error {
  color: #fda4af;
}

:deep(.task-list-panel__priority[data-priority='high']) {
  color: #fb7185;
}

:deep(.task-list-panel__priority[data-priority='medium']) {
  color: #f59e0b;
}

:deep(.task-list-panel__priority[data-priority='low']) {
  color: #2dd4bf;
}

:deep(.task-list-panel__row-actions) {
  grid-column: 3;
  grid-row: 1;
  justify-self: end;
  position: relative;
  display: flex;
  align-items: flex-start;
}

.task-list-panel__completed-toggle {
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(30, 41, 59, 0.9);
  color: rgba(226, 232, 240, 0.92);
}

.task-list-panel__completed-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-radius: 0;
  background: transparent;
  color: rgba(226, 232, 240, 0.88);
}

.task-list-panel__completed-toggle:hover,
.task-list-panel__completed-toggle:focus-visible {
  color: #f8fafc;
}

.task-list-panel__completed-chevron {
  width: 16px;
  height: 16px;
  color: rgba(148, 163, 184, 0.9);
  transition: transform 120ms ease;
}

.task-list-panel__completed-chevron--expanded {
  transform: rotate(180deg);
}

:deep(.task-list-panel__menu-trigger) {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  min-height: auto;
  padding: 0;
  border: 0;
  border-radius: 6px !important;
  background: transparent !important;
  box-shadow: none !important;
  color: rgba(226, 232, 240, 0.78) !important;
  font: inherit;
}

:deep(.task-list-panel__menu-trigger:hover),
:deep(.task-list-panel__menu-trigger:focus-visible) {
  background: rgba(255, 255, 255, 0.045) !important;
  color: rgba(248, 250, 252, 0.9) !important;
}

:deep(.task-list-panel__menu-trigger svg) {
  width: 15px;
  height: 15px;
}

:deep(.task-list-panel__menu) {
  position: absolute;
  top: 26px;
  right: 0;
  z-index: 2;
  display: grid;
  gap: 2px;
  min-width: 72px;
  padding: 4px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.14);
  box-shadow: 0 8px 18px rgba(2, 6, 23, 0.28);
}

:deep(.task-list-panel__menu button) {
  appearance: none;
  min-height: auto;
  padding: 5px 8px;
  border: 0;
  border-radius: 7px;
  box-shadow: none;
  text-align: left;
  font-size: 12px;
  line-height: 1.2;
  background: transparent;
  color: rgba(226, 232, 240, 0.92);
  font: inherit;
}

:deep(.task-list-panel__menu button:hover),
:deep(.task-list-panel__menu button:focus-visible) {
  background: rgba(255, 255, 255, 0.06);
}
</style>
