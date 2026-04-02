<template>
  <form class="external-history-search" data-testid="external-history-search" @submit.prevent="emitSubmit">
    <div class="search-input-shell">
      <input
        :value="modelValue"
        class="search-input"
        type="search"
        :placeholder="placeholder"
        :disabled="loading"
        data-testid="external-history-search-input"
        @input="emitUpdate"
      >
      <button
        v-if="modelValue"
        class="clear-btn"
        type="button"
        :disabled="loading"
        data-testid="external-history-search-clear"
        aria-label="清空搜索"
        @click="$emit('clear')"
      >
        ×
      </button>
    </div>
    <button
      class="submit-btn"
      type="submit"
      :disabled="loading"
      data-testid="external-history-search-submit"
    >
      {{ loading ? '搜索中...' : '搜索' }}
    </button>
  </form>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
  loading?: boolean;
  placeholder?: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'submit'): void;
  (event: 'clear'): void;
}>();

function emitUpdate(event: Event) {
  const target = event.target;
  emit('update:modelValue', target instanceof HTMLInputElement ? target.value : '');
}

function emitSubmit() {
  emit('submit');
}
</script>

<style scoped>
.external-history-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 4px 12px 0;
}

.search-input-shell {
  position: relative;
  flex: 1;
  min-width: 0;
}

.search-input {
  width: 100%;
  min-height: 38px;
  padding: 0 36px 0 12px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.72);
  color: var(--cp-text-primary);
  font-size: 13px;
}

.search-input::placeholder {
  color: var(--cp-text-faint);
}

.search-input:focus-visible {
  outline: none;
  border-color: rgba(96, 165, 250, 0.78);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
}

.clear-btn,
.submit-btn {
  border: none;
  cursor: pointer;
}

.clear-btn {
  position: absolute;
  top: 50%;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  transform: translateY(-50%);
  background: transparent;
  color: var(--cp-text-muted);
  font-size: 16px;
  line-height: 1;
}

.clear-btn:hover,
.clear-btn:focus-visible {
  background: rgba(255, 255, 255, 0.08);
  color: var(--cp-text-primary);
}

.submit-btn {
  flex: 0 0 auto;
  min-height: 38px;
  padding: 0 12px;
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.18);
  color: #dbeafe;
  font-size: 13px;
  font-weight: 600;
}

.submit-btn:hover,
.submit-btn:focus-visible {
  background: rgba(59, 130, 246, 0.28);
}

.clear-btn:disabled,
.submit-btn:disabled,
.search-input:disabled {
  cursor: default;
  opacity: 0.72;
}
</style>
