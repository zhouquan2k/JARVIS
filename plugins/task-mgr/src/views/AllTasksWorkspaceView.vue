<template>
  <section class="all-tasks-workspace" data-testid="all-tasks-workspace">
    <aside class="all-tasks-workspace__sidebar" data-testid="all-tasks-shortcuts">
      <button
        v-for="item in shortcutItems"
        :key="item.tag"
        type="button"
        class="all-tasks-workspace__shortcut"
        :class="{ 'all-tasks-workspace__shortcut--active': selectedTag === item.tag }"
        :data-testid="`all-tasks-shortcut-${item.tag}`"
        @click="selectedTag = item.tag"
      >
        <span class="all-tasks-workspace__shortcut-label">{{ item.label }}</span>
        <span class="all-tasks-workspace__shortcut-hint">{{ item.hint }}</span>
      </button>
    </aside>
    <div class="all-tasks-workspace__main">
      <header class="all-tasks-workspace__header">
        <h2 data-testid="all-tasks-heading">{{ activeShortcut.label }}</h2>
        <p data-testid="all-tasks-description">{{ activeShortcut.hint }}</p>
      </header>
      <TaskListPanel
        :document-path="null"
        :agent-key="null"
        :tag="panelTag"
        :group-by-date="selectedTag === 'planned'"
        :include-tomorrow="selectedTag === 'today'"
        :show-completed-section="selectedTag === 'today'"
        :completed-only="selectedTag === 'completed'"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { IContextProvider } from '@packages/core/src';
import type { TaskQueryTag } from '../../api';
import { useWorkspaceI18n } from '@packages/ui';
import TaskListPanel from '../components/TaskListPanel.vue';

type ViewTag = TaskQueryTag | 'completed';

const props = defineProps<{
  contextProvider: IContextProvider;
}>();

const { t } = useWorkspaceI18n();
const selectedTag = ref<ViewTag>('today');

const panelTag = computed<TaskQueryTag>(() => selectedTag.value === 'completed' ? 'all' : selectedTag.value);

const shortcutItems = computed(() => [
  {
    tag: 'today' as ViewTag,
    label: t('shared.today'),
    hint: t('shared.todayTasksHint')
  },
  {
    tag: 'planned' as ViewTag,
    label: t('shared.planned'),
    hint: t('shared.plannedTasksHint')
  },
  {
    tag: 'scheduled' as ViewTag,
    label: t('shared.scheduled'),
    hint: t('shared.scheduledTasksHint')
  },
  {
    tag: 'backlog' as ViewTag,
    label: t('shared.backlog'),
    hint: t('shared.backlogTasksHint')
  },
  {
    tag: 'completed' as ViewTag,
    label: t('shared.completedTasksTab'),
    hint: t('shared.completedTasksHint')
  }
]);

const activeShortcut = computed(() => {
  return shortcutItems.value.find((item) => item.tag === selectedTag.value) ?? shortcutItems.value[0];
});

</script>

<style scoped>
.all-tasks-workspace {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  background:
    radial-gradient(circle at top left, rgba(14, 165, 233, 0.16), transparent 38%),
    linear-gradient(180deg, rgba(9, 14, 24, 0.98), rgba(4, 8, 15, 0.98));
}

.all-tasks-workspace__sidebar {
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 18px 14px;
  border-right: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(8, 12, 20, 0.78);
}

.all-tasks-workspace__shortcut {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 14px 14px 12px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.78);
  color: rgba(226, 232, 240, 0.94);
  text-align: left;
  cursor: pointer;
}

.all-tasks-workspace__shortcut--active {
  border-color: rgba(56, 189, 248, 0.42);
  background: linear-gradient(180deg, rgba(14, 165, 233, 0.24), rgba(15, 23, 42, 0.9));
  box-shadow: 0 18px 36px rgba(2, 132, 199, 0.18);
}

.all-tasks-workspace__shortcut-label {
  font-size: 14px;
  font-weight: 700;
}

.all-tasks-workspace__shortcut-hint {
  font-size: 12px;
  color: rgba(191, 219, 254, 0.74);
}

.all-tasks-workspace__main {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 20px 22px 24px;
}

.all-tasks-workspace__header h2 {
  margin: 0;
  font-size: 24px;
  color: #f8fafc;
}

.all-tasks-workspace__header p {
  margin: 6px 0 0;
  color: rgba(191, 219, 254, 0.78);
}

@media (max-width: 900px) {
  .all-tasks-workspace {
    grid-template-columns: 1fr;
  }

  .all-tasks-workspace__sidebar {
    grid-auto-flow: column;
    grid-auto-columns: minmax(180px, 1fr);
    overflow: auto;
    border-right: 0;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  }
}
</style>
