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
      <div class="task-editor-inline__meta-row">
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
      </div>
      <div class="task-editor-inline__meta-row task-editor-inline__meta-row--paired">
        <label class="task-editor-inline__field task-editor-inline__field--paired task-editor-inline__field--priority">
          <span class="task-editor-inline__sr-only">{{ t('shared.taskPriority') }}</span>
          <div
            class="task-editor-inline__input-shell task-editor-inline__input-shell--select task-editor-inline__input-shell--paired"
            data-testid="task-editor-priority-shell"
            @click="openPriorityPicker"
          >
            <select
              ref="prioritySelect"
              v-model="priorityValue"
              class="task-editor-inline__input task-editor-inline__select task-editor-inline__select--priority"
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
        <label class="task-editor-inline__field task-editor-inline__field--paired task-editor-inline__field--recurrence">
          <span class="task-editor-inline__sr-only">{{ t('shared.taskRecurrence') }}</span>
          <div
            class="task-editor-inline__input-shell task-editor-inline__input-shell--select task-editor-inline__input-shell--paired"
            data-testid="task-editor-recurrence-shell"
            @click="openRecurrencePicker"
          >
            <select
              ref="recurrenceSelect"
              v-model="recurrenceValue"
              class="task-editor-inline__input task-editor-inline__select task-editor-inline__select--recurrence"
              data-testid="task-editor-recurrence"
            >
              <option value="">{{ t('shared.taskRecurrenceNone') }}</option>
              <option value="daily">{{ t('shared.taskRecurrenceDaily') }}</option>
              <option value="weekly">{{ t('shared.taskRecurrenceWeekly') }}</option>
              <option value="monthly">{{ t('shared.taskRecurrenceMonthly') }}</option>
            </select>
            <svg class="task-editor-inline__select-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="m5.25 7.75 4.75 4.75 4.75-4.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" />
            </svg>
          </div>
        </label>
        <label class="task-editor-inline__field task-editor-inline__field--paired task-editor-inline__field--execution-state">
          <span class="task-editor-inline__sr-only">{{ t('shared.taskExecutionState') }}</span>
          <div
            class="task-editor-inline__input-shell task-editor-inline__input-shell--select task-editor-inline__input-shell--paired"
            data-testid="task-editor-execution-state-shell"
            @click="openExecutionStatePicker"
          >
            <select
              ref="executionStateSelect"
              v-model="executionStateValue"
              class="task-editor-inline__input task-editor-inline__select task-editor-inline__select--execution-state"
              data-testid="task-editor-execution-state"
            >
              <option value="">{{ t('shared.taskExecutionStateNone') }}</option>
              <option value="doing">{{ t('shared.taskExecutionStateDoing') }}</option>
              <option value="morning">{{ t('shared.taskExecutionStateMorning') }}</option>
              <option value="afternoon">{{ t('shared.taskExecutionStateAfternoon') }}</option>
              <option value="evening">{{ t('shared.taskExecutionStateEvening') }}</option>
            </select>
            <svg class="task-editor-inline__select-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="m5.25 7.75 4.75 4.75 4.75-4.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" />
            </svg>
          </div>
        </label>
      </div>
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
import type { Task, TaskExecutionState, TaskPriority, TaskRecurrence } from '../../api';
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
const executionStateSelect = ref<HTMLSelectElement | null>(null);
const recurrenceSelect = ref<HTMLSelectElement | null>(null);
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

const executionStateValue = computed({
  get: () => draft.value.executionState ?? '',
  set: (value: string) => {
    draft.value.executionState = (value || null) as TaskExecutionState;
  }
});

const recurrenceValue = computed({
  get: () => draft.value.recurrence ?? '',
  set: (value: string) => {
    draft.value.recurrence = (value || null) as TaskRecurrence;
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

function openExecutionStatePicker(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest('select')) {
    return;
  }

  const select = executionStateSelect.value;
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

function openRecurrencePicker(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest('select')) {
    return;
  }

  const select = recurrenceSelect.value;
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
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
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
  background: rgba(255, 255, 255, 0.03);
  transition: background-color 120ms ease, box-shadow 120ms ease;
}

.task-editor-inline__input-shell:focus-within {
  background: rgba(255, 255, 255, 0.07);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.24);
}

.task-editor-inline__input-shell--date {
  padding-right: 0;
  background: transparent;
  box-shadow: none;
}

.task-editor-inline__input-shell--time {
  justify-content: flex-end;
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.task-editor-inline__input-shell--select {
  position: relative;
  padding-right: 36px;
}

.task-editor-inline__input-shell--paired {
  min-height: 34px;
  padding-inline: 0;
  border-radius: 10px;
  background: transparent;
  box-shadow: none;
  justify-content: flex-start;
}

.task-editor-inline__time-toggle {
  border: 0;
  width: 100%;
  padding: 4px 0;
  background: transparent;
  color: rgba(226, 232, 240, 0.82);
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  text-align: right;
}

.task-editor-inline__time-toggle:hover,
.task-editor-inline__time-toggle:focus-visible {
  color: rgba(226, 232, 240, 0.96);
}

.task-editor-inline__input[type='date'] {
  min-width: 0;
}

.task-editor-inline__field--date .task-editor-inline__input,
.task-editor-inline__field--time .task-editor-inline__input {
  padding-inline: 0;
  color: rgba(226, 232, 240, 0.82);
  font-size: 13px;
  font-weight: 500;
}

.task-editor-inline__field--time .task-editor-inline__input {
  text-align: right;
}

.task-editor-inline__field--date .task-editor-inline__input:focus,
.task-editor-inline__field--time .task-editor-inline__input:focus {
  background: transparent;
  color: rgba(226, 232, 240, 0.96);
}

.task-editor-inline__field--date .task-editor-inline__input-shell:hover,
.task-editor-inline__field--time .task-editor-inline__input-shell:hover {
  background: rgba(255, 255, 255, 0.035);
}

.task-editor-inline__field--date .task-editor-inline__input-shell:focus-within,
.task-editor-inline__field--time .task-editor-inline__input-shell:focus-within {
  background: rgba(255, 255, 255, 0.055);
  box-shadow: none;
}

.task-editor-inline__input[type='date']::-webkit-calendar-picker-indicator,
.task-editor-inline__input[type='time']::-webkit-calendar-picker-indicator {
  filter: invert(0.9) brightness(1.2);
  opacity: 0.92;
  cursor: pointer;
}

.task-editor-inline__select {
  appearance: none;
  width: auto;
  min-width: 0;
  padding: 4px 0;
  padding-right: 0;
  border-radius: 0;
  color: rgba(226, 232, 240, 0.82);
  font-size: 13px;
  font-weight: 500;
}

.task-editor-inline__select-icon {
  position: absolute;
  right: 2px;
  width: 14px;
  height: 14px;
  color: rgba(148, 163, 184, 0.6);
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  width: 100%;
  min-width: 0;
}

@media (max-width: 640px) {
  .task-editor-inline__meta-row {
    grid-template-columns: minmax(0, 1fr);
  }
}

.task-editor-inline__meta-row {
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr) 120px;
  align-items: start;
  flex: 1 1 180px;
  min-width: 0;
}

.task-editor-inline__meta-row--paired {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  justify-content: flex-start;
  min-width: 0;
  box-sizing: border-box;
}

.task-editor-inline__field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: rgba(148, 163, 184, 0.92);
}

.task-editor-inline__field--time {
  width: 120px;
}

.task-editor-inline__field--paired {
  min-width: 0;
  width: fit-content;
  flex: 0 0 auto;
}

.task-editor-inline__field--paired .task-editor-inline__input-shell:hover {
  background: rgba(255, 255, 255, 0.035);
}

.task-editor-inline__field--paired .task-editor-inline__input-shell:focus-within {
  background: rgba(255, 255, 255, 0.055);
  box-shadow: none;
}

.task-editor-inline__field--paired .task-editor-inline__input-shell {
  display: inline-flex;
  width: fit-content;
  min-width: 0;
  max-width: none;
}

.task-editor-inline__field--priority .task-editor-inline__input-shell {
  min-width: 80px;
}

.task-editor-inline__field--execution-state .task-editor-inline__input-shell {
  min-width: 80px;
}

.task-editor-inline__select--priority {
  min-width: 56px;
}

.task-editor-inline__select--execution-state {
  min-width: 56px;
}

.task-editor-inline__field--recurrence .task-editor-inline__input-shell {
  min-width: 80px;
}

.task-editor-inline__select--recurrence {
  min-width: 64px;
}

.task-editor-inline__field--paired .task-editor-inline__select:focus {
  color: rgba(226, 232, 240, 0.96);
}

.task-editor-inline__field--paired .task-editor-inline__input-shell:hover .task-editor-inline__select-icon,
.task-editor-inline__field--paired .task-editor-inline__input-shell:focus-within .task-editor-inline__select-icon {
  color: rgba(226, 232, 240, 0.82);
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
