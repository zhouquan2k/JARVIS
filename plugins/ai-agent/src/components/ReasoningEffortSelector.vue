<template>
  <label class="select-shell reasoning-shell">
    <span class="sr-only">{{ t('shared.selectReasoningEffort') }}</span>
    <select
      :value="value"
      class="select-control"
      :disabled="disabled"
      data-testid="reasoning-effort"
      @change="onChange"
    >
      <option value="low">{{ t('shared.reasoningEffortLow') }}</option>
      <option value="medium">{{ t('shared.reasoningEffortMedium') }}</option>
      <option value="high">{{ t('shared.reasoningEffortHigh') }}</option>
    </select>
  </label>
</template>

<script setup lang="ts">
import type { ReasoningEffort } from '@plugins/ai-agent/src/internal';
import { useWorkspaceI18n } from '@packages/ui/src/i18n';

const props = withDefaults(defineProps<{
  value: ReasoningEffort;
  disabled?: boolean;
}>(), {
  disabled: false
});

const emit = defineEmits<{
  (e: 'change', value: ReasoningEffort): void;
}>();

const { t } = useWorkspaceI18n();

function onChange(event: Event) {
  const nextValue = (event.target as HTMLSelectElement).value;
  if (nextValue === 'low' || nextValue === 'medium' || nextValue === 'high') {
    emit('change', nextValue);
  }
}
</script>

<style scoped>
.select-shell {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 35px;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(34, 39, 48, 0.96), rgba(22, 26, 34, 0.98)),
    rgba(17, 24, 39, 0.96);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 10px 30px rgba(0, 0, 0, 0.18);
}

.select-shell::after {
  content: '';
  position: absolute;
  right: 16px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-right: 1.5px solid rgba(226, 232, 240, 0.78);
  border-bottom: 1.5px solid rgba(226, 232, 240, 0.78);
  transform: translateY(-70%) rotate(45deg);
  pointer-events: none;
}

.reasoning-shell {
  flex: 0 0 auto;
  width: clamp(120px, 12vw, 148px);
}

.select-control {
  width: 100%;
  height: 35px;
  min-width: 0;
  padding: 0 42px 0 14px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--cp-text-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  outline: none;
  appearance: none;
}

.select-control:focus-visible {
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.26);
}

.select-control:disabled {
  color: var(--cp-text-muted);
  cursor: not-allowed;
}

.sr-only {
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
</style>
