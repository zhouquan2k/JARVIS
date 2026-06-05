<template>
  <form class="task-editor-inline" data-testid="task-editor-inline" @submit.prevent="submit">
    <input
      v-model="draft.title"
      class="task-editor-inline__title"
      data-testid="task-editor-title"
      :placeholder="t('shared.taskTitlePlaceholder')"
      maxlength="200"
    />
    <div class="task-editor-inline__meta">
      <label class="task-editor-inline__field task-editor-inline__field--date">
        <span class="task-editor-inline__sr-only">{{ t('shared.taskDueAt') }}</span>
        <div class="task-editor-inline__input-shell task-editor-inline__input-shell--date">
          <input
            v-model="dueDateInput"
            class="task-editor-inline__input"
            data-testid="task-editor-due-at"
            type="date"
          />
        </div>
      </label>
      <label class="task-editor-inline__field task-editor-inline__field--time">
        <span class="task-editor-inline__sr-only">{{ t('shared.taskTime') }}</span>
        <div class="task-editor-inline__input-shell task-editor-inline__input-shell--time">
          <input
            v-if="timeEditorVisible"
            v-model="dueTimeInput"
            class="task-editor-inline__input"
            data-testid="task-editor-due-time"
            type="time"
          />
          <button
            v-else
            type="button"
            class="task-editor-inline__time-toggle"
            data-testid="task-editor-time-toggle"
            @click="timeEditorVisible = true"
          >
            {{ dueTimeDisplay }}
          </button>
        </div>
      </label>
      <label class="task-editor-inline__field task-editor-inline__field--priority">
        <span class="task-editor-inline__sr-only">{{ t('shared.taskPriority') }}</span>
        <div
          class="task-editor-inline__input-shell task-editor-inline__input-shell--select"
          data-testid="task-editor-priority-shell"
          @click="openPriorityPicker"
        >
          <select
            ref="prioritySelect"
            v-model="priorityValue"
            class="task-editor-inline__input task-editor-inline__select"
            data-testid="task-editor-priority"
          >
            <option value="">{{ t('shared.taskPriorityNone') }}</option>
            <option value="low">{{ t('shared.taskPriorityLow') }}</option>
            <option value="medium">{{ t('shared.taskPriorityMedium') }}</option>
            <option value="high">{{ t('shared.taskPriorityHigh') }}</option>
          </select>
          <svg class="task-editor-inline__select-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="m5.25 7.75 4.75 4.75 4.75-4.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" />
          </svg>
        </div>
      </label>
    </div>
    <textarea
      ref="notesInput"
      v-model="draft.notes"
      class="task-editor-inline__notes"
      data-testid="task-editor-notes"
      :placeholder="t('shared.taskNotesPlaceholder')"
      rows="1"
      @input="resizeNotes"
    />
    <p v-if="validationError" class="task-editor-inline__error" data-testid="task-editor-error">
      {{ validationError }}
    </p>
    <div class="task-editor-inline__actions">
      <button type="button" class="task-editor-inline__ghost" data-testid="task-editor-cancel" @click="emit('cancel')">
        {{ t('shared.cancel') }}
      </button>
      <button type="submit" class="task-editor-inline__primary" data-testid="task-editor-save">
        {{ t('shared.save') }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { Task, TaskPriority } from '../../api';
import { useWorkspaceI18n } from '@packages/ui/src/i18n';

const props = defineProps<{
  task: Task;
}>();

const emit = defineEmits<{
  (event: 'save', task: Task): void;
  (event: 'cancel'): void;
}>();

const { t } = useWorkspaceI18n();
const validationError = ref<string | null>(null);
const draft = ref<Task>({ ...props.task });
const notesInput = ref<HTMLTextAreaElement | null>(null);
const prioritySelect = ref<HTMLSelectElement | null>(null);
const timeEditorVisible = ref(false);

const dueDateInput = computed({
  get: () => {
    if (!draft.value.dueAt) {
      return '';
    }

    const date = new Date(draft.value.dueAt);
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60_000);
    return localDate.toISOString().slice(0, 10);
  },
  set: (value: string) => {
    if (!value) {
      draft.value.dueAt = null;
      timeEditorVisible.value = false;
      return;
    }

    const existingTime = dueTimeInput.value || '00:00';
    draft.value.dueAt = new Date(`${value}T${existingTime}:00`).getTime();
  }
});

const dueTimeInput = computed({
  get: () => {
    if (!draft.value.dueAt) {
      return '';
    }

    const date = new Date(draft.value.dueAt);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  },
  set: (value: string) => {
    if (!value) {
      if (!draft.value.dueAt) {
        return;
      }
      dueDateInput.value = dueDateInput.value;
      return;
    }

    const baseDate = dueDateInput.value || formatDateForInput(new Date());
    draft.value.dueAt = new Date(`${baseDate}T${value}:00`).getTime();
  }
});

const dueTimeDisplay = computed(() => dueTimeInput.value || t('shared.taskTime'));

const priorityValue = computed({
  get: () => draft.value.priority ?? '',
  set: (value: string) => {
    draft.value.priority = (value || null) as TaskPriority | null;
  }
});

watch(
  () => props.task,
  (task) => {
    draft.value = { ...task };
    validationError.value = null;
    timeEditorVisible.value = Boolean(task.dueAt && dueTimeInput.value);
    void nextTick(resizeNotes);
  },
  { deep: true }
);

watch(
  () => draft.value.notes,
  () => {
    void nextTick(resizeNotes);
  }
);

onMounted(() => {
  void nextTick(resizeNotes);
});

function submit(): void {
  const title = draft.value.title.trim();
  if (!title) {
    validationError.value = t('shared.taskTitleRequired');
    return;
  }

  validationError.value = null;
  emit('save', {
    ...draft.value,
    title
  });
}

function resizeNotes(): void {
  const element = notesInput.value;
  if (!element) {
    return;
  }

  element.style.height = '0px';
  element.style.height = `${element.scrollHeight}px`;
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function openPriorityPicker(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest('select')) {
    return;
  }

  const select = prioritySelect.value;
  if (!select) {
    return;
  }

  select.focus();
  if (typeof select.showPicker === 'function') {
    select.showPicker();
    return;
  }
  select.click();
}
</script>

<style scoped>
.task-editor-inline {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.72);
}

.task-editor-inline__title,
.task-editor-inline__notes,
.task-editor-inline__input {
  box-sizing: border-box;
  width: 100%;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: rgba(226, 232, 240, 0.96);
  padding: 10px 12px;
  outline: none;
}

.task-editor-inline__title::placeholder,
.task-editor-inline__notes::placeholder {
  color: rgba(148, 163, 184, 0.72);
}

.task-editor-inline__title {
  background: rgba(255, 255, 255, 0.05);
  font-size: 16px;
  font-weight: 600;
}

.task-editor-inline__title:focus,
.task-editor-inline__notes:focus,
.task-editor-inline__input:focus {
  background: rgba(255, 255, 255, 0.02);
}

.task-editor-inline__title:focus {
  background: rgba(255, 255, 255, 0.08);
}

.task-editor-inline__notes {
  min-height: 36px;
  line-height: 1.4;
  resize: none;
  overflow: hidden;
}

.task-editor-inline__input-shell {
  display: flex;
  align-items: center;
  min-height: 44px;
  border-radius: 12px;
  background: transparent;
  transition: background-color 120ms ease;
}

.task-editor-inline__input-shell:focus-within {
  background: rgba(255, 255, 255, 0.07);
}

.task-editor-inline__input-shell--date {
  padding-right: 4px;
}

.task-editor-inline__input-shell--time {
  justify-content: center;
  padding: 0 4px;
}

.task-editor-inline__input-shell--select {
  position: relative;
  padding-right: 36px;
}

.task-editor-inline__time-toggle {
  border: 0;
  width: 100%;
  padding: 0 4px;
  background: transparent;
  color: rgba(148, 163, 184, 0.9);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  text-align: center;
}

.task-editor-inline__time-toggle:hover,
.task-editor-inline__time-toggle:focus-visible {
  color: rgba(226, 232, 240, 0.96);
}

.task-editor-inline__input[type='date'] {
  min-width: 0;
}

.task-editor-inline__select {
  appearance: none;
  padding-right: 0;
}

.task-editor-inline__select-icon {
  position: absolute;
  right: 12px;
  width: 16px;
  height: 16px;
  color: rgba(226, 232, 240, 0.72);
  pointer-events: none;
}

.task-editor-inline__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.task-editor-inline__meta {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) 84px 84px;
  align-items: start;
}

@media (max-width: 640px) {
  .task-editor-inline__meta {
    grid-template-columns: minmax(0, 1fr);
  }
}

.task-editor-inline__field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: rgba(148, 163, 184, 0.92);
}

.task-editor-inline__field--priority {
  justify-self: end;
  width: 84px;
}

.task-editor-inline__field--time {
  width: 84px;
}

.task-editor-inline__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.task-editor-inline__ghost,
.task-editor-inline__primary {
  border: 0;
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
}

.task-editor-inline__ghost {
  background: rgba(51, 65, 85, 0.6);
  color: rgba(226, 232, 240, 0.96);
}

.task-editor-inline__primary {
  background: linear-gradient(135deg, #f97316, #fb7185);
  color: #fff7ed;
}

.task-editor-inline__error {
  margin: 0;
  color: #fda4af;
  font-size: 12px;
}
</style>
