<template>
  <div
    v-if="options.length > 0"
    class="model-option-toggle-group"
    data-testid="model-option-toggle-group"
    role="group"
    :aria-label="t('shared.modelOptions')"
  >
      <button
      v-for="option in options"
      :key="option.key"
      type="button"
      class="toggle-chip"
      :class="{ active: value[option.key] === true }"
      :disabled="disabled"
      :aria-label="option.labelKey ? t(option.labelKey) : option.label"
      :aria-pressed="value[option.key] === true"
      :data-testid="`model-option-${option.key}`"
      @click="emit('change', { key: option.key, enabled: value[option.key] !== true })"
    >
      <span class="icon-shell" aria-hidden="true">
        <svg v-if="option.key === 'web_search'" viewBox="0 0 24 24" class="option-icon">
          <path d="M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17Z" />
          <path d="M3.8 12h16.4" />
          <path d="M12 3.8c2.1 2.2 3.3 5.1 3.3 8.2S14.1 18 12 20.2c-2.1-2.2-3.3-5.1-3.3-8.2S9.9 6 12 3.8Z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" class="option-icon">
          <path d="M10.2 4.5L6.5 12h4l-1.2 7.5L17.5 10h-4L16 4.5z" />
        </svg>
      </span>
      <span class="switch-track" aria-hidden="true">
        <span class="switch-thumb" />
      </span>
      <span v-if="option.description" class="toggle-tip" role="tooltip">
        <strong>{{ option.labelKey ? t(option.labelKey) : option.label }}</strong>
        <span>{{ option.descriptionKey ? t(option.descriptionKey) : option.description }}</span>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ModelOptionDefinition } from '@packages/core/config';
import { useWorkspaceI18n } from '../i18n';

defineProps<{
  options: ModelOptionDefinition[];
  value: Record<string, boolean>;
  disabled?: boolean;
}>();

const { t } = useWorkspaceI18n();

const emit = defineEmits<{
  (e: 'change', payload: { key: string; enabled: boolean }): void;
}>();
</script>

<style scoped>
.model-option-toggle-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-width: 0;
}

.toggle-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: auto;
  height: 38px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: rgba(241, 245, 249, 0.92);
  transition:
    color 160ms ease,
    transform 160ms ease;
}

.toggle-chip:hover:not(:disabled) {
  color: #ffffff;
  transform: translateY(-1px);
}

.toggle-chip.active {
  color: #ffffff;
}

.toggle-chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.icon-shell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
}

.option-icon {
  width: 26px;
  height: 26px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.switch-track {
  position: relative;
  width: 24px;
  height: 14px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.28);
  transition: background 160ms ease;
}

.switch-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.92);
  transition: transform 160ms ease, background 160ms ease;
}

.toggle-chip.active .switch-track {
  background: rgba(56, 189, 248, 0.34);
}

.toggle-chip.active .switch-thumb {
  transform: translateX(10px);
  background: #f8fafc;
}

.toggle-tip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 120px;
  max-width: 220px;
  padding: 8px 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  background: rgba(9, 12, 18, 0.96);
  box-shadow: 0 14px 26px rgba(0, 0, 0, 0.28);
  color: var(--cp-text-primary);
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, 4px);
  transition: opacity 140ms ease, transform 140ms ease;
  z-index: 6;
}

.toggle-tip strong {
  font-size: 12px;
  font-weight: 700;
}

.toggle-tip span {
  color: var(--cp-text-muted);
}

.toggle-chip:hover .toggle-tip,
.toggle-chip:focus-visible .toggle-tip {
  opacity: 1;
  transform: translate(-50%, 0);
}

@media (max-width: 720px) {
  .toggle-tip {
    left: auto;
    right: 0;
    transform: translateY(4px);
  }

  .toggle-chip:hover .toggle-tip,
  .toggle-chip:focus-visible .toggle-tip {
    transform: translateY(0);
  }
}
</style>
